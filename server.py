from flask import Flask, render_template
from app.api import api_bp
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
        return render_template("index.html", main_js_version=version)

    return app


if __name__ == "__main__":
    app = create_app()
    app.run(host="0.0.0.0", port=5000, debug=False)
