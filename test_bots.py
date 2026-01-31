import json

# Load the config
with open('bot_config.json', 'r', encoding='utf-8') as f:
    config = json.load(f)

# Check if modular format
if 'strength_profiles' in config and 'style_profiles' in config:
    print("✅ MODULAR CONFIG DETECTED!")
    print("\nAvailable bots:")
    for bot_name in config.get('bots', {}).keys():
        if not bot_name.startswith('_'):
            bot = config['bots'][bot_name]
            print(f"  - {bot_name}: {bot.get('strength')} + {bot.get('style')}")
    print("If you see this = Modular system is ACTIVE! 🎉")
else:
    print("⚠️ Legacy config format detected")
