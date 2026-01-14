from flask import Flask, render_template
from app.api import api_bp
import app.api as api_mod
import os
import hashlib


def create_app():
    app = Flask(__name__, static_folder="static", template_folder="templates")
    app.register_blueprint(api_bp)

    @app.get("/")
    def home():
        # Compute a cache-busting version using an MD5 of the main.js contents
        main_js_path = os.path.join(app.static_folder, 'main.js')
        try:
            with open(main_js_path, 'rb') as fh:
                data = fh.read()
            version = hashlib.md5(data).hexdigest()
        except Exception:
            version = '1'
        return render_template("index.html", main_js_version=version, v1_mode=api_mod.V1_MODE, debug_mode=app.debug)

    return app


if __name__ == "__main__":
    # Allow enabling debug mode via environment variable for convenience during development.
    # Supported env vars: DEBUG or FLASK_DEBUG. Values '1','true','yes','on' enable debug.
    dbg_env = os.environ.get('DEBUG') or os.environ.get('FLASK_DEBUG')
    debug_mode = False
    try:
        if isinstance(dbg_env, str) and dbg_env.strip().lower() in ('1', 'true', 'yes', 'on'):
            debug_mode = True
    except Exception:
        debug_mode = False

    app = create_app()
    app.run(host="0.0.0.0", port=5000, debug=debug_mode)
