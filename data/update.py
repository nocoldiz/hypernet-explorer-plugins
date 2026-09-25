import json
import os
import re

FILENAME = 'classes.json'
BACKUP_FILENAME = 'classes.json.bak'

def calculate_curve(start, end, current_level):
    """Calculates linear interpolation between level 1 and 99."""
    if current_level == 1:
        return start
    if current_level >= 99:
        return end
    
    # Progress fraction from level 1 to 99 (98 level ups total)
    progress = (current_level - 1) / 98.0
    return int(round(start + progress * (end - start)))

def run_updater():
    if not os.path.exists(FILENAME):
        print(f"Error: Could not find '{FILENAME}' in the current directory.")
        return

    # Load the classes data
    with open(FILENAME, 'r', encoding='utf-8') as file:
        data = json.load(file)

    # Create a backup just in case
    with open(BACKUP_FILENAME, 'w', encoding='utf-8') as backup_file:
        json.dump(data, backup_file, ensure_ascii=False)
    print(f"Backup created at '{BACKUP_FILENAME}'")

    updated_count = 0

    # Index 0 is always null in RPG Maker MZ JSON files
    for cls in data:
        if not cls:
            continue
            
        name = cls.get('name', 'Unknown')
        note = cls.get('note', '')
        params = cls.get('params', [])

        # Ensure the params array exists and has at least MHP (0) and MMP (1)
        if len(params) < 2:
            continue

        # --- UPDATE HP (Param 0) ---
        hp_curve = params[0]
        # Only modify up to level 99 (indices 1 to 99)
        max_level_index = min(100, len(hp_curve))
        if max_level_index > 1:
            hp_start = hp_curve[1]
            hp_end = 9999
            for lvl in range(1, max_level_index):
                hp_curve[lvl] = calculate_curve(hp_start, hp_end, lvl)

        # --- UPDATE MP (Param 1) ---
        mp_curve = params[1]
        mp_start = None
        mp_end = None

        # Check class notes for the Nature tags (case-insensitive)
        if re.search(r'<Nature:\s*Both>', note, re.IGNORECASE):
            mp_start, mp_end = 70, 7000
        elif re.search(r'<Nature:\s*Mundane>', note, re.IGNORECASE):
            mp_start, mp_end = 50, 5000
        elif re.search(r'<Nature:\s*Magical>', note, re.IGNORECASE):
            mp_start, mp_end = 100, 9999

        # If a valid note was found, apply the MP curve
        if mp_start is not None and mp_end is not None and max_level_index > 1:
            for lvl in range(1, max_level_index):
                mp_curve[lvl] = calculate_curve(mp_start, mp_end, lvl)
            print(f"[{name}] Updated - HP: {hp_start}->9999 | MP ({mp_start}->{mp_end})")
        else:
            print(f"[{name}] Updated - HP: {hp_start}->9999 | MP Skipped (No valid <Nature: ...> note)")
            
        updated_count += 1

    # Save the modified JSON back to the file
    # Using separators to match MZ's tight JSON formatting without indent spaces
    with open(FILENAME, 'w', encoding='utf-8') as file:
        json.dump(data, file, ensure_ascii=False, separators=(',', ':'))

    print(f"\nSuccess! {updated_count} classes successfully updated.")

if __name__ == "__main__":
    run_updater()