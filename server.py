from flask import Flask, render_template, request, jsonify
from datetime import datetime
from pathlib import Path
import json
from app.api import api_bp
import app.api as api_mod
import os
import hashlib


def create_app():
    app = Flask(__name__, static_folder="static", template_folder="templates")
    app.register_blueprint(api_bp)

    @app.route('/submit-feedback', methods=['POST'])
    def submit_feedback():
        """Handle feedback submissions and save to file."""
        try:
            data = request.get_json() or {}
            name = data.get('name', 'Anonymous')
            feedback = data.get('feedback', '')

            # Create feedback directory if it doesn't exist
            feedback_dir = Path(__file__).parent / 'feedback'
            feedback_dir.mkdir(exist_ok=True)

            # Save to feedback file with timestamp
            feedback_file = feedback_dir / 'user_feedback.txt'
            timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

            with open(feedback_file, 'a', encoding='utf-8') as f:
                f.write(f"\n{'='*60}\n")
                f.write(f"Date: {timestamp}\n")
                f.write(f"Name: {name}\n")
                f.write(f"Feedback:\n{feedback}\n")
                f.write(f"{'='*60}\n")

            return jsonify({'status': 'success'}), 200
        except Exception as e:
            app.logger.exception('Error saving feedback')
            return jsonify({'status': 'error', 'message': str(e)}), 500

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
