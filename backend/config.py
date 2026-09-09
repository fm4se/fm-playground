import logging
import os
from logging.handlers import TimedRotatingFileHandler

from dotenv import load_dotenv
from flask import Flask
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_migrate import Migrate
from flask_sqlalchemy import SQLAlchemy

load_dotenv()

app = Flask(__name__)

# ------------------ Logging ------------------
app.logger.setLevel(logging.INFO)
log_handler = TimedRotatingFileHandler(
    "logs/app.log", when="midnight", interval=1, backupCount=30
)  # 30 days
log_handler.setLevel(logging.INFO)
formatter = logging.Formatter("%(asctime)s - %(levelname)s - %(message)s")
log_handler.setFormatter(formatter)
app.logger.addHandler(log_handler)
# ------------------ Logging ------------------

# ------------------ Rate Limit ------------------
limiter = Limiter(
    get_remote_address,
    app=app,
    default_limits=["3600 per hour"],
    storage_uri="memory://",
)
# ------------------ Rate Limit ------------------

# ------------------ Session/Cookie Config ------------------
# Secret key (fix env var name typo); this must be stable across restarts to keep sessions valid
app.secret_key = os.getenv("APP_SECRET_KEY")

# Session cookie settings tuned for local dev and containerized deployments.
# You can override these via environment variables when running behind a reverse proxy/HTTPS.
app.config.setdefault(
    "SESSION_COOKIE_NAME", os.getenv("SESSION_COOKIE_NAME", "fmp_session")
)
app.config.setdefault(
    "SESSION_COOKIE_SAMESITE",
    os.getenv(
        "SESSION_COOKIE_SAMESITE", "Lax"
    ),  # set to "None" when frontend is on a different site
)
app.config.setdefault(
    "SESSION_COOKIE_SECURE",
    os.getenv("SESSION_COOKIE_SECURE", "false").lower()
    == "true",  # must be true if SAMESITE=None
)
app.config.setdefault("SESSION_COOKIE_HTTPONLY", True)

# Flask-Session: ensure server-side session storage directory exists when using filesystem backend
app.config.setdefault("SESSION_TYPE", os.getenv("SESSION_TYPE", "filesystem"))
session_dir = os.getenv("SESSION_FILE_DIR") or os.path.join(
    os.getcwd(), "flask_session"
)
os.makedirs(session_dir, exist_ok=True)
app.config.setdefault("SESSION_FILE_DIR", session_dir)
app.config.setdefault("SESSION_PERMANENT", True)
app.config.setdefault(
    "PERMANENT_SESSION_LIFETIME", int(os.getenv("PERMANENT_SESSION_LIFETIME", 3600))
)
# ------------------ Session/Cookie Config ------------------

# ------------------ App Config ------------------
if os.getenv("FLASK_ENV") == "development":
    app.config["DEBUG"] = True
    use_sqlite = os.getenv("USE_SQLITE", "false").lower() == "true"
    if use_sqlite:
        app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///fmp.db"
    else:
        app.config["SQLALCHEMY_DATABASE_URI"] = (
            f"postgresql://{os.getenv('DB_USERNAME')}:{os.getenv('DB_PASSWORD')}@{os.getenv('DB_HOST')}/{os.getenv('DB_NAME')}"
        )
else:
    app.config["DEBUG"] = False
    app.config["SQLALCHEMY_DATABASE_URI"] = (
        f"postgresql://{os.getenv('DB_USERNAME')}:{os.getenv('DB_PASSWORD')}@{os.getenv('DB_HOST')}/{os.getenv('DB_NAME')}"
    )
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.config["CACHE_TYPE"] = "SimpleCache"
app.config["GOOGLE_CLIENT_ID"] = os.getenv("GOOGLE_CLIENT_ID", None)
app.config["GOOGLE_CLIENT_SECRET"] = os.getenv("GOOGLE_CLIENT_SECRET", None)
app.config["GOOGLE_DISCOVERY_URL"] = (
    "https://accounts.google.com/.well-known/openid-configuration"
)
app.json.compact = False
# ------------------ App Config ------------------

# ------------------ Database ------------------
db = SQLAlchemy()
migrate = Migrate(app, db)
db.init_app(app)
# ------------------ Database ------------------
