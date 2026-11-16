import json

from sqlalchemy import func

from .models import Code, Data, DataDetails, ResultLogs, User, db

DATE_FORMAT = "%d %b %y %I:%M %p"

# Suffixes of the diff-editor check types listed with their tool in the history SMTSemDiff. 
# SynDiff entries are auto-saved helpers and stay hidden.
DIFF_CHECK_SUFFIXES = ("SemDiff",)


def check_type_filter(check_type: str):
    """Match a tool's own check type and the check types of its diff runs."""
    return Data.check_type.in_(
        [check_type, *(check_type + suffix for suffix in DIFF_CHECK_SUFFIXES)]
    )


def code_exists_in_db(code: str):
    return db.session.query(Code).filter_by(code=code).first()


def code_exists_in_db_for_same_check(check: str, code: str):
    return (
        db.session.query(Data).filter_by(code=code).filter_by(check_type=check).first()
    )


def code_exists_in_db_different_check(code: str):
    return db.session.query(Data).filter_by(code=code).first()


def get_id_by_permalink(p: str):
    return db.session.query(Data).filter_by(permalink=p).first()


def get_user_history(
    user_id: int, page: int = 1, per_page: int = 20, check_type: str = None
):
    """
    Get the user history of a user. The data is sorted by time in descending order.

    Parameters:
      user_id (int): The id of the user
      page (int): The page number
      per_page (int): The number of items per page
      check_type (str): Optional filter for specific check type (e.g., 'SAT', 'SMT', 'XMV')

    Returns:
      list: The list of the data
      bool: True if there are more data, False otherwise
    """
    # Calculate start and end indices for pagination
    start_index = (page - 1) * per_page
    end_index = page * per_page

    # Build base query
    query = (
        db.session.query(
            Data.id,
            Data.time,
            Data.check_type,
            Data.permalink,
            Code.code,
            DataDetails.title,
            DataDetails.tags,
            DataDetails.pinned,
        )
        .join(Code, Data.code_id == Code.id)
        .outerjoin(DataDetails, DataDetails.data_id == Data.id)
        .order_by(Data.time.desc())
        .filter(Data.user_id == user_id)
    )

    # Add check_type filter if provided
    if check_type:
        query = query.filter(check_type_filter(check_type))

    # Apply pagination
    query_result = query.slice(start_index, end_index).all()

    # Extract the data from the query result
    data = query_result

    result = []
    for d in data:
        p_time = d.time.strftime(DATE_FORMAT)
        p_code = d.code[:25] + "..." if len(d.code) > 25 else d.code
        title = getattr(d, "title", None)
        # Only use title if it's not None and not empty string
        if title:
            title = title.strip()
        title = title if title else None
        tags = getattr(d, "tags", None)
        pinned = getattr(d, "pinned", False) or False
        result.append(
            {
                "id": d.id,
                "time": p_time,
                "time_iso": (
                    d.time.isoformat() if hasattr(d, "time") and d.time else None
                ),
                "check": d.check_type,
                "permalink": d.permalink,
                "code": p_code,
                "title": title,
                "tags": tags,
                "pinned": pinned,
            }
        )
    has_more_data = True if len(result) == per_page else False
    return result, has_more_data


def get_user_history_by_session(
    user_session_id: str, page: int = 1, per_page: int = 20, check_type: str = None
):
    """
    Get the user history of a user if the user is not logged in. The data is sorted by time in descending order.

    Parameters:
      user_session_id (str): The session id of the user
      page (int): The page number
      per_page (int): The number of items per page
      check_type (str): Optional filter for specific check type (e.g., 'SAT', 'SMT', 'XMV')

    Returns:
      list: The list of the data
      bool: True if there are more data, False otherwise
    """
    # Calculate start and end indices for pagination
    start_index = (page - 1) * per_page
    end_index = page * per_page

    # Build base query
    query = (
        db.session.query(
            Data.id,
            Data.time,
            Data.check_type,
            Data.permalink,
            Code.code,
            DataDetails.title,
            DataDetails.tags,
            DataDetails.pinned,
        )
        .join(Code, Data.code_id == Code.id)
        .outerjoin(DataDetails, DataDetails.data_id == Data.id)
        .order_by(Data.time.desc())
        .filter(Data.session_id == user_session_id)
    )

    # Add check_type filter if provided
    if check_type:
        query = query.filter(check_type_filter(check_type))

    # Apply pagination
    query_result = query.slice(start_index, end_index).all()

    # Extract the data from the query result
    data = query_result

    result = []
    for d in data:
        p_time = d.time.strftime(DATE_FORMAT)
        p_code = d.code[:35] + "..." if len(d.code) > 35 else d.code
        title = getattr(d, "title", None)
        # Only use title if it's not None and not empty string
        if title:
            title = title.strip()
        title = title if title else None
        tags = getattr(d, "tags", None)
        pinned = getattr(d, "pinned", False) or False
        result.append(
            {
                "id": d.id,
                "time": p_time,
                "time_iso": (
                    d.time.isoformat() if hasattr(d, "time") and d.time else None
                ),
                "check": d.check_type,
                "permalink": d.permalink,
                "code": p_code,
                "title": title,
                "tags": tags,
                "pinned": pinned,
            }
        )
    has_more_data = True if len(result) == per_page else False
    return result, has_more_data


def get_pinned_history(user_id: int, check_type: str = None):
    """
    Get all pinned history items for a user. The data is sorted by time in descending order.

    Parameters:
      user_id (int): The id of the user
      check_type (str): Optional filter for specific check type (e.g., 'SAT', 'SMT', 'XMV')

    Returns:
      list: The list of pinned data items
    """
    # Build base query
    query = (
        db.session.query(
            Data.id,
            Data.time,
            Data.check_type,
            Data.permalink,
            Code.code,
            DataDetails.title,
            DataDetails.tags,
            DataDetails.pinned,
        )
        .join(Code, Data.code_id == Code.id)
        .join(DataDetails, DataDetails.data_id == Data.id)
        .filter(Data.user_id == user_id)
        .filter(DataDetails.pinned == True)
        .order_by(Data.time.desc())
    )

    # Add check_type filter if provided
    if check_type:
        query = query.filter(check_type_filter(check_type))

    # Get all pinned items
    query_result = query.all()

    result = []
    for d in query_result:
        p_time = d.time.strftime(DATE_FORMAT)
        p_code = d.code[:25] + "..." if len(d.code) > 25 else d.code
        title = getattr(d, "title", None)
        # Only use title if it's not None and not empty string
        if title:
            title = title.strip()
        title = title if title else None
        tags = getattr(d, "tags", None)
        pinned = getattr(d, "pinned", False) or False
        result.append(
            {
                "id": d.id,
                "time": p_time,
                "time_iso": (
                    d.time.isoformat() if hasattr(d, "time") and d.time else None
                ),
                "check": d.check_type,
                "permalink": d.permalink,
                "code": p_code,
                "title": title,
                "tags": tags,
                "pinned": pinned,
            }
        )
    return result


def get_pinned_history_by_session(user_session_id: str, check_type: str = None):
    """
    Get all pinned history items for a user by session if the user is not logged in.
    The data is sorted by time in descending order.

    Parameters:
      user_session_id (str): The session id of the user
      check_type (str): Optional filter for specific check type (e.g., 'SAT', 'SMT', 'XMV')

    Returns:
      list: The list of pinned data items
    """
    # Build base query
    query = (
        db.session.query(
            Data.id,
            Data.time,
            Data.check_type,
            Data.permalink,
            Code.code,
            DataDetails.title,
            DataDetails.tags,
            DataDetails.pinned,
        )
        .join(Code, Data.code_id == Code.id)
        .join(DataDetails, DataDetails.data_id == Data.id)
        .filter(Data.session_id == user_session_id)
        .filter(DataDetails.pinned == True)
        .order_by(Data.time.desc())
    )

    # Add check_type filter if provided
    if check_type:
        query = query.filter(check_type_filter(check_type))

    # Get all pinned items
    query_result = query.all()

    result = []
    for d in query_result:
        p_time = d.time.strftime(DATE_FORMAT)
        p_code = d.code[:35] + "..." if len(d.code) > 35 else d.code
        title = getattr(d, "title", None)
        # Only use title if it's not None and not empty string
        if title:
            title = title.strip()
        title = title if title else None
        tags = getattr(d, "tags", None)
        pinned = getattr(d, "pinned", False) or False
        result.append(
            {
                "id": d.id,
                "time": p_time,
                "time_iso": (
                    d.time.isoformat() if hasattr(d, "time") and d.time else None
                ),
                "check": d.check_type,
                "permalink": d.permalink,
                "code": p_code,
                "title": title,
                "tags": tags,
                "pinned": pinned,
            }
        )
    return result


def update_user_history_by_id(data_id: int):
    """
    Unlink the user history by id.
    This function is used to unlink the user history from the user account.

    Parameters:
      data_id (int): The id of the data to unlink
    Returns:
      bool: True if the update is successful, False otherwise
    """
    try:
        db.session.query(Data).filter_by(id=data_id).update({"user_id": None})
        db.session.commit()
        return True
    except Exception:
        db.session.rollback()
        return False


def get_code_by_data_id(data_id: int):
    """
    Get the code by data id. Join the Data and Code table and get the code.

    Parameters:
      data_id (int): The id of the data
    Returns:
      Code: The code object
    """
    return (
        db.session.query(Data.check_type, Data.permalink, Code.code, Data.meta)
        .join(Data, Data.code_id == Code.id)
        .filter(Data.id == data_id)
        .first()
    )


def search_by_query(
    query, user_id: int = None, check_type: str = None, search_in: str = "all"
):
    """
    Search the history of a user by query across different fields.

    Parameters:
      query (str): The query to search
      user_id (int): The id of the user
      check_type (str): Optional filter for specific check type (e.g., 'SAT', 'SMT', 'XMV')
      search_in (str): Where to search - 'all', 'code', 'title', or 'tags' (default: 'all')
    Returns:
      list: The list of the data matching the query
    """
    search_query = (
        db.session.query(
            Data.id,
            Data.time,
            Data.check_type,
            Data.permalink,
            Code.code,
            DataDetails.title,
            DataDetails.tags,
            DataDetails.pinned,
        )
        .join(Code, Data.code_id == Code.id)
        .outerjoin(DataDetails, DataDetails.data_id == Data.id)
        .order_by(Data.time.desc())
        .filter(Data.user_id == user_id)
    )

    # Build search conditions based on search_in parameter
    if search_in == "code":
        search_query = search_query.filter(
            func.lower(Code.code).ilike(func.lower(f"%{query}%"))
        )
    elif search_in == "title":
        search_query = search_query.filter(
            func.lower(DataDetails.title).ilike(func.lower(f"%{query}%"))
        )
    elif search_in == "tags":
        search_query = search_query.filter(
            func.lower(DataDetails.tags).ilike(func.lower(f"%{query}%"))
        )
    else:  # search_in == "all" or any other value defaults to searching all fields
        search_query = search_query.filter(
            func.lower(Code.code).ilike(func.lower(f"%{query}%"))
            | func.lower(DataDetails.title).ilike(func.lower(f"%{query}%"))
            | func.lower(DataDetails.tags).ilike(func.lower(f"%{query}%"))
        )

    # Add check_type filter if provided
    if check_type:
        search_query = search_query.filter(check_type_filter(check_type))

    search_result = search_query.all()

    data = search_result
    result = []
    for d in data:
        p_time = d.time.strftime(DATE_FORMAT)
        p_code = d.code[:25] + "..." if len(d.code) > 25 else d.code
        title = getattr(d, "title", None)
        # Only use title if it's not None and not empty string
        if title:
            title = title.strip()
        title = title if title else None
        tags = getattr(d, "tags", None)
        pinned = getattr(d, "pinned", False) or False
        result.append(
            {
                "id": d.id,
                "time": p_time,
                "time_iso": (
                    d.time.isoformat() if hasattr(d, "time") and d.time else None
                ),
                "check": d.check_type,
                "permalink": d.permalink,
                "code": p_code,
                "title": title,
                "tags": tags,
                "pinned": pinned,
            }
        )
    return result


def search_by_query_and_session(
    query, session_id: str = None, check_type: str = None, search_in: str = "all"
):
    """
    Search the history of a user by query and session id; used when user is not logged in.
    Parameters:
        query (str): The query to search
        session_id (str): The session id of the user
        check_type (str): Optional filter for specific check type (e.g., 'SAT', 'SMT', 'XMV')
        search_in (str): Where to search - 'all', 'code', 'title', or 'tags' (default: 'all')
    Returns:
        list: The list of the data matching the query
    """
    search_query = (
        db.session.query(
            Data.id,
            Data.time,
            Data.check_type,
            Data.permalink,
            Code.code,
            DataDetails.title,
            DataDetails.tags,
            DataDetails.pinned,
        )
        .join(Code, Data.code_id == Code.id)
        .outerjoin(DataDetails, DataDetails.data_id == Data.id)
        .order_by(Data.time.desc())
        .filter(Data.session_id == session_id)
    )

    # Build search conditions based on search_in parameter
    if search_in == "code":
        search_query = search_query.filter(
            func.lower(Code.code).ilike(func.lower(f"%{query}%"))
        )
    elif search_in == "title":
        search_query = search_query.filter(
            func.lower(DataDetails.title).ilike(func.lower(f"%{query}%"))
        )
    elif search_in == "tags":
        search_query = search_query.filter(
            func.lower(DataDetails.tags).ilike(func.lower(f"%{query}%"))
        )
    else:  # search_in == "all" or any other value defaults to searching all fields
        search_query = search_query.filter(
            func.lower(Code.code).ilike(func.lower(f"%{query}%"))
            | func.lower(DataDetails.title).ilike(func.lower(f"%{query}%"))
            | func.lower(DataDetails.tags).ilike(func.lower(f"%{query}%"))
        )

    # Add check_type filter if provided
    if check_type:
        search_query = search_query.filter(check_type_filter(check_type))

    search_result = search_query.all()

    data = search_result
    result = []
    for d in data:
        p_time = d.time.strftime(DATE_FORMAT)
        p_code = d.code[:25] + "..." if len(d.code) > 25 else d.code
        title = getattr(d, "title", None)
        # Only use title if it's not None and not empty string
        if title:
            title = title.strip()
        title = title if title else None
        tags = getattr(d, "tags", None)
        pinned = getattr(d, "pinned", False) or False
        result.append(
            {
                "id": d.id,
                "time": p_time,
                "time_iso": (
                    d.time.isoformat() if hasattr(d, "time") and d.time else None
                ),
                "check": d.check_type,
                "permalink": d.permalink,
                "code": p_code,
                "title": title,
                "tags": tags,
                "pinned": pinned,
            }
        )
    return result


def get_user_data(user_id):
    user = User.query.filter_by(id=user_id).first()

    history = (
        db.session.query(Data.id, Data.time, Data.check_type, Data.permalink, Code.code)
        .join(Code, Data.code_id == Code.id)
        .order_by(Data.time.desc())
        .filter(Data.user_id == user_id)
        .all()
    )

    downloadables = []
    # add history to downloadables
    for h in history:
        downloadables.append(
            {
                "time": h.time.strftime(DATE_FORMAT),
                "check": h.check_type,
                "permalink": h.permalink,
                "code": h.code,
            }
        )

    return user.email, downloadables


def delete_user(user_id):
    try:
        db.session.query(Data).filter_by(user_id=user_id).update({"user_id": None})
        db.session.query(User).filter_by(id=user_id).delete()
        db.session.commit()
        return True
    except Exception:
        db.session.rollback()
        return False


def get_history_by_permalink(permalink: str, user_id: int):
    """
    Get the history by permalink.

    Parameters:
      permalink (str): The permalink of the data
    Returns:
      Data: The data object
    """
    query_result = (
        db.session.query(Data.id, Data.time, Data.check_type, Data.permalink, Code.code)
        .join(Code, Data.code_id == Code.id)
        .order_by(Data.time.desc())
        .filter(Data.permalink == permalink)
        .filter(Data.user_id == user_id)
        .first()
    )

    result = {
        "check": query_result.check_type,
        "code": query_result.code,
        "id": query_result.id,
        "permalink": query_result.permalink,
        "time": query_result.time.strftime(DATE_FORMAT),
    }

    return result


def get_metadata_by_permalink(
    c: str,
    p: str,
) -> str:
    try:
        query_result = (
            db.session.query(Data.meta)
            .filter(Data.permalink == p, Data.check_type == c)
            .first()
        )
        if query_result is None:
            return json.dumps(
                {"error": "No result found for the given permalink and check type."}
            )
        meta_json_str = query_result[0]

        # Check if it's a valid JSON string format
        if not (
            meta_json_str
            and meta_json_str.startswith("{")
            and meta_json_str.endswith("}")
        ):
            return json.dumps(
                {"error": "No valid JSON string found in the query result."}
            )
        meta_data = json.loads(meta_json_str)

    except json.JSONDecodeError:
        return json.dumps({"error": "Error parsing JSON string."})
    except Exception as e:
        return json.dumps({"error": f"An unexpected error occurred: {str(e)}"})

    return json.dumps(
        {
            "meta": meta_data.get("check")
            or meta_data.get("cli_option")
            or meta_data.get("cmd")
            or meta_data
        }
    )


def update_metadata_by_permalink(
    p: str,
    new_metadata: dict,
) -> bool:
    """Append metadata for a specific permalink."""
    try:
        data_entry = db.session.query(Data).filter(Data.permalink == p).first()
        if data_entry is None:
            return False
        # append new metadata to existing metadata
        existing_metadata = json.loads(data_entry.meta) if data_entry.meta else {}
        existing_metadata.update(new_metadata)
        data_entry.meta = json.dumps(existing_metadata)
        db.session.commit()
        return True

    except Exception:
        db.session.rollback()
        return False


def insert_result_log(permalink: str, result: str) -> bool:
    try:
        # Fetch data_id by permalink
        data_entry = db.session.query(Data).filter(Data.permalink == permalink).first()
        if data_entry is None:
            return False

        # Insert the result log
        new_result_log = ResultLogs(data_id=data_entry.id, result=result)
        db.session.add(new_result_log)
        db.session.commit()
        return True

    except Exception:
        db.session.rollback()
        return False
