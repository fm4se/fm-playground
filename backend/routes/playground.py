import json
import sys

sys.path.append("..")  # Adds higher directory to python modules path.

import time  # noqa: E402
from datetime import datetime  # noqa: E402

import pytz  # noqa: E402
from config import app, limiter  # noqa: E402
from db.db_query import (  # noqa: E402
    code_exists_in_db,
    delete_user,
    get_code_by_data_id,
    get_history_by_permalink,
    get_id_by_permalink,
    get_metadata_by_permalink,
    get_pinned_history,
    get_pinned_history_by_session,
    get_user_data,
    get_user_history,
    get_user_history_by_session,
    insert_result_log,
    search_by_query,
    search_by_query_and_session,
    update_metadata_by_permalink,
    update_user_history_by_id,
)
from db.models import Code, Data, DataDetails, db  # noqa: E402
from flask import Blueprint, jsonify, make_response, request, session  # noqa: E402
from utils.logging_utils import (  # noqa: E402
    generate_after_request_log,
    generate_before_request_log,
)
from utils.permalink_generator import generate_passphrase  # noqa: E402

aware_datetime = datetime.now(pytz.utc)

ERROR_LOGGEDIN_MESSAGE = "You are not logged in."
TRY_AGAIN_MESSAGE = "There is a problem. Please try after some time."
RECENT_REQUEST_MESSAGE = "You have already made a request recently."
CODE_TOO_LARGE_MESSAGE = "The code is too large."
COMMENT_TOO_LARGE_MESSAGE = "The comment is too large."

routes = Blueprint("routes", __name__)


# ------------------ Helper Functions ------------------
def is_valid_size(code: str) -> bool:
    """Check if the code is less than 1MB

    Parameters:
      code (str): The code to be checked

    Returns:
      bool: True if the code is less than 1MB, False otherwise
    """
    size_in_bytes = sys.getsizeof(code)
    size_in_mb = size_in_bytes / (1024 * 1024)
    if size_in_mb > 1:
        app.logger.error(f"Code is too large. Size: {size_in_mb}MB")
    return size_in_mb <= 1


# ------------------ Helper Functions ------------------


# ------------------ Logging ------------------
@routes.before_request
def before_request():
    """Log the request before processing"""
    request.start_time = time.time()
    app.logger.info(generate_before_request_log(request))


@routes.after_request
def after_request(response):
    """Log the response after processing"""
    app.logger.info(generate_after_request_log(request, response))
    return response


# ------------------ Logging ------------------


@routes.route("/api/save", methods=["POST"])
@limiter.limit("2/second", error_message=RECENT_REQUEST_MESSAGE)
def save():
    user_id = session.get("user_id")
    current_time = datetime.now(pytz.utc)
    data = request.get_json()
    check_type = data["check"]
    code = data["code"]
    parent = get_id_by_permalink(data["parent"])
    metadata = data["meta"]
    if parent is None:
        parent_id = None
    else:
        parent_id = parent.id
    if not is_valid_size(code):
        response = make_response(jsonify({"result": CODE_TOO_LARGE_MESSAGE}), 413)
        return response
    p_gen_time = time.time()
    permalink = generate_passphrase()
    app.logger.info(
        f"Permalink Generation - Permalink: {permalink} Gen Time: {time.time() - p_gen_time}"
    )
    try:
        code_id_in_db = code_exists_in_db(code)
        session_id = session.sid
        if code_id_in_db is None:  # New: Save the code
            new_code = Code(code=code)
            db.session.add(new_code)
            db.session.commit()
            code_id = new_code.id
        else:  # Exist: Use the existing code id
            code_id = code_id_in_db.id

        new_data = Data(
            time=datetime.now(),
            session_id=session_id,
            parent=parent_id,
            check_type=check_type,
            permalink=permalink,
            meta=metadata,
            code_id=code_id,
            user_id=user_id,
        )
        db.session.add(new_data)
        db.session.commit()
        # Don't create DataDetails here - it will be created only when user sets custom title/tags
    except Exception:
        app.logger.error(f"Error saving the code. Permalink: {permalink}")
        db.session.rollback()
        response = make_response(jsonify({"permalink": TRY_AGAIN_MESSAGE}), 500)
        return response
    session["last_request_time"] = current_time
    response = make_response(
        jsonify({"check": check_type, "permalink": permalink}), 200
    )
    return response


@routes.route("/api/permalink/", methods=["GET"])
def get_code():
    p = request.args.get("p")
    code_data = (
        Code.query.join(Data, Data.code_id == Code.id)
        .filter_by(permalink=p)
        .first_or_404()
    )
    data_id = Data.query.filter_by(permalink=p).first().id
    response = make_response(
        jsonify({"code": code_data.code, "code_id": code_data.id, "data_id": data_id}),
        200,
    )
    return response


@routes.route("/api/histories", methods=["GET"])
def get_history():
    user_id = session.get("user_id")
    user_session_id = session.sid
    page = request.args.get("page", 1, type=int)
    check_type = request.args.get("check", None, type=str)  # Get optional check filter
    per_page = 20

    if user_id is None:
        if user_session_id:
            data, has_more_data = get_user_history_by_session(
                user_session_id, page=page, per_page=per_page, check_type=check_type
            )
            data = [d for d in data if not d.get("check", "").endswith("SynDiff")] # We don't want to show Syntactic Diff entries in the history
            return jsonify({"history": data, "has_more_data": has_more_data})
        return jsonify({"result": "fail", "message": ERROR_LOGGEDIN_MESSAGE}, 401)

    data, has_more_data = get_user_history(
        user_id, page=page, per_page=per_page, check_type=check_type
    )
    data = [d for d in data if not d.get("check", "").endswith("SynDiff")]
    return jsonify({"history": data, "has_more_data": has_more_data})


@routes.route("/api/histories/pinned", methods=["GET"])
def get_pinned_items():
    """Get all pinned history items"""
    user_id = session.get("user_id")
    user_session_id = session.sid
    check_type = request.args.get("check", None, type=str)  # Get optional check filter

    if user_id is None:
        if user_session_id:
            data = get_pinned_history_by_session(user_session_id, check_type=check_type)
            data = [d for d in data if not d.get("check", "").endswith("SynDiff")]
            return jsonify({"history": data})
        return jsonify({"result": "fail", "message": ERROR_LOGGEDIN_MESSAGE}, 401)

    data = get_pinned_history(user_id, check_type=check_type)
    data = [d for d in data if not d.get("check", "").endswith("SynDiff")]
    return jsonify({"history": data})


@routes.route("/api/unlink-history", methods=["PUT"])
def unlink_history_by_id():
    user_id = session.get("user_id")
    if user_id is None:
        return jsonify({"result": "fail", "message": ERROR_LOGGEDIN_MESSAGE}, 401)
    data = request.get_json()
    data_id = data["id"]
    if update_user_history_by_id(data_id):
        return jsonify({"result": "success"})
    return jsonify({"result": "fail", "message": TRY_AGAIN_MESSAGE}, 500)


@routes.route("/api/code/<int:data_id>", methods=["GET"])
def get_code_by_id(data_id: int):
    data = get_code_by_data_id(data_id)
    if data and Data.query.filter_by(id=data_id).first():
        payload = {
            "result": "success",
            "code": data.code,
            "check": data.check_type,
            "permalink": data.permalink,
        }
        if data.meta:
            try:
                meta_dict = json.loads(data.meta)
            except (TypeError, ValueError):
                meta_dict = None
            if isinstance(meta_dict, dict):
                left_side_code_id = meta_dict.get("leftSideCodeId")
                if left_side_code_id is not None:
                    left_data = get_code_by_data_id(left_side_code_id)
                    payload["meta"] = meta_dict
                    payload["leftSideCodeId"] = left_side_code_id
                    payload["leftCode"] = left_data.code if left_data else ""
        return jsonify(payload)
    return jsonify({"result": "fail", "message": TRY_AGAIN_MESSAGE}, 500)


# Search the history data by query
@routes.route("/api/search", methods=["GET"])
def search():
    user_id = session.get("user_id")
    session_id = session.sid
    query = request.args.get("q")
    check_type = request.args.get("check", None, type=str)  # Get optional check filter
    search_in = request.args.get(
        "search_in", "all", type=str
    )  # Get search scope: all, code, title, tags

    if user_id is None:
        if session_id:
            data = search_by_query_and_session(
                query, session_id=session_id, check_type=check_type, search_in=search_in
            )
            return jsonify({"history": data, "has_more_data": False})
        return jsonify({"result": "fail", "message": ERROR_LOGGEDIN_MESSAGE}, 401)

    data = search_by_query(
        query, user_id=user_id, check_type=check_type, search_in=search_in
    )
    return jsonify({"history": data, "has_more_data": False})


# Download the user data
@routes.route("/api/download-user-data", methods=["GET"])
def download_user_data():
    user_id = session.get("user_id")
    if user_id is None:
        return jsonify({"result": "fail", "message": ERROR_LOGGEDIN_MESSAGE}, 401)
    user, data = get_user_data(user_id)
    return jsonify({"email": user, "data": data})


# Delete the user profile and all the data
@routes.route("/api/delete-profile", methods=["DELETE"])
def delete_profile():
    user_id = session.get("user_id")
    if user_id is None:
        return jsonify({"result": "fail", "message": ERROR_LOGGEDIN_MESSAGE}, 401)
    if delete_user(user_id):
        return jsonify({"result": "success"})
    return jsonify({"result": "fail", "message": TRY_AGAIN_MESSAGE}, 500)


# Get the history by permalink
@routes.route("/api/history/<permalink>", methods=["GET"])
def history_by_permalink(permalink: str):
    user_id = session.get("user_id")
    if user_id is None:
        return jsonify({"result": "fail", "message": ERROR_LOGGEDIN_MESSAGE}, 401)
    data = get_history_by_permalink(permalink, user_id=user_id)
    if data:
        return jsonify({"history": data}), 200
    return jsonify({"result": "fail", "message": TRY_AGAIN_MESSAGE}, 500)


@routes.route("/api/metadata", methods=["GET"])
def get_metadata():
    c = request.args.get("check")
    p = request.args.get("p")
    metadata = get_metadata_by_permalink(c, p)
    return jsonify(metadata), 200


@routes.route("/api/metadata/update", methods=["PUT"])
def update_metadata():
    """Update metadata by permalink"""
    data = request.get_json()
    if not data or "permalink" not in data:
        return jsonify({"result": "fail", "message": "Invalid request"}), 400
    data_to_update = {k: v for k, v in data.items() if k != "permalink"}
    if update_metadata_by_permalink(data.get("permalink"), data_to_update):
        return jsonify({"result": "success"})
    return jsonify({"result": "fail", "message": TRY_AGAIN_MESSAGE}, 500)


# ------------------ Title/Tags Update Endpoints ------------------


@routes.route("/api/history/<int:data_id>/title", methods=["PUT"])
def update_history_title(data_id: int):
    user_id = session.get("user_id")
    user_session_id = session.sid
    payload = request.get_json() or {}
    new_title = payload.get("title", "").strip()
    # Allow empty title (will revert to showing date/time on frontend)
    # if not new_title:
    #     return jsonify({"result": "fail", "message": "Title cannot be empty"}), 400

    # Ownership check: either user owns it, or same session for anonymous
    data_row = db.session.query(Data).filter(Data.id == data_id).first()
    if not data_row:
        return jsonify({"result": "fail", "message": "Not found"}), 404
    if data_row.user_id:
        if user_id is None or data_row.user_id != user_id:
            return jsonify({"result": "fail", "message": ERROR_LOGGEDIN_MESSAGE}), 401
    else:
        if data_row.session_id != user_session_id:
            return jsonify({"result": "fail", "message": ERROR_LOGGEDIN_MESSAGE}), 401

    try:
        details = db.session.query(DataDetails).filter_by(data_id=data_id).first()
        if details is None:
            # Only create details if title is not empty
            if new_title:
                details = DataDetails(data_id=data_id, title=new_title)
                db.session.add(details)
        else:
            details.title = new_title if new_title else None
        db.session.commit()
        return jsonify({"result": "success"})
    except Exception:
        db.session.rollback()
        return jsonify({"result": "fail", "message": TRY_AGAIN_MESSAGE}), 500


@routes.route("/api/history/<int:data_id>/pin", methods=["PUT"])
def update_history_pin(data_id: int):
    user_id = session.get("user_id")
    user_session_id = session.sid
    payload = request.get_json() or {}
    pinned = payload.get("pinned")
    if not isinstance(pinned, bool):
        return jsonify({"result": "fail", "message": "Pinned must be a boolean"}), 400

    # Ensure the database actually has the 'pinned' column; otherwise, guide to migrate
    try:
        from sqlalchemy import inspect as sa_inspect

        insp = sa_inspect(db.engine)
        cols = [c.get("name") for c in insp.get_columns("data_details")]
        if "pinned" not in cols:
            return (
                jsonify(
                    {
                        "result": "fail",
                        "message": "Pinned feature not available until DB is migrated (missing data_details.pinned).",
                    }
                ),
                501,
            )
    except Exception:
        # If inspection fails, proceed; errors will be caught below and reported
        pass

    data_row = db.session.query(Data).filter(Data.id == data_id).first()
    if not data_row:
        return jsonify({"result": "fail", "message": "Not found"}), 404
    if data_row.user_id:
        if user_id is None or data_row.user_id != user_id:
            return jsonify({"result": "fail", "message": ERROR_LOGGEDIN_MESSAGE}), 401
    else:
        if data_row.session_id != user_session_id:
            return jsonify({"result": "fail", "message": ERROR_LOGGEDIN_MESSAGE}), 401

    try:
        details = db.session.query(DataDetails).filter_by(data_id=data_id).first()
        if details is None:
            # Only create details when pinning, no default title
            details = DataDetails(data_id=data_id, title=None, pinned=pinned)
            db.session.add(details)
        else:
            details.pinned = pinned
        db.session.commit()
        return jsonify({"result": "success"})
    except Exception:
        db.session.rollback()
        return jsonify({"result": "fail", "message": TRY_AGAIN_MESSAGE}), 500


@routes.route("/api/history/<int:data_id>/tags", methods=["PUT"])
def update_history_tags(data_id: int):
    user_id = session.get("user_id")
    user_session_id = session.sid
    payload = request.get_json() or {}
    tags = payload.get("tags")
    if tags is not None and not isinstance(tags, list):
        return jsonify({"result": "fail", "message": "Tags must be a list"}), 400

    data_row = db.session.query(Data).filter(Data.id == data_id).first()
    if not data_row:
        return jsonify({"result": "fail", "message": "Not found"}), 404
    if data_row.user_id:
        if user_id is None or data_row.user_id != user_id:
            return jsonify({"result": "fail", "message": ERROR_LOGGEDIN_MESSAGE}), 401
    else:
        if data_row.session_id != user_session_id:
            return jsonify({"result": "fail", "message": ERROR_LOGGEDIN_MESSAGE}), 401

    try:
        import json

        tags_json = json.dumps(tags or [])
        details = db.session.query(DataDetails).filter_by(data_id=data_id).first()
        if details is None:
            # Only create details if tags are being added, no default title
            details = DataDetails(data_id=data_id, title=None, tags=tags_json)
            db.session.add(details)
        else:
            details.tags = tags_json
        db.session.commit()
        return jsonify({"result": "success"})
    except Exception:
        db.session.rollback()
        return jsonify({"result": "fail", "message": TRY_AGAIN_MESSAGE}), 500


# ------------------ Result Logs Endpoint ------------------


@routes.route("/api/analysis/log", methods=["POST"])
def create_result_log():
    data = request.get_json()

    if not data:
        return jsonify({"result": "fail", "message": "No data provided"}), 400

    permalink = data.get("permalink")
    result = data.get("result")
    print(permalink, result)

    if not permalink:
        return jsonify({"result": "fail", "message": "Permalink is required"}), 400

    if not result:
        return jsonify({"result": "fail", "message": "Result is required"}), 400

    if not is_valid_size(result):
        return jsonify({"result": "fail", "message": "Result data is too large"}), 413

    try:
        if insert_result_log(permalink, result):
            return (
                jsonify(
                    {"result": "success", "message": "Result log created successfully"}
                ),
                201,
            )
        else:
            return (
                jsonify(
                    {
                        "result": "fail",
                        "message": "Permalink not found or insert failed",
                    }
                ),
                404,
            )
    except Exception as e:
        app.logger.error(f"Error creating result log: {str(e)}")
        return jsonify({"result": "fail", "message": TRY_AGAIN_MESSAGE}), 500
