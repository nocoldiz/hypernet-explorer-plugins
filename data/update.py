import json
import os
import re
import random

FILENAME = 'classes.json'
BACKUP_FILENAME = 'classes.json.bak'

def calculate_standard_curve(start, end, current_level):
    """The extreme slow curve used for Both and Mundane."""
    if current_level <= 1:
        return start
    if current_level >= 99:
        return end
    
    progress = (current_level - 1) / 98.0
    curved_progress = progress ** 3.5
    return int(round(start + curved_progress * (end - start)))

def calculate_magical_curve(start, current_level):
    """Custom curve for Magical: +50 MP per level under 10, then curves to 9999."""
    end = 9999
    
    if current_level <= 1:
        return start
    if current_level >= 99:
        return end
    
    if current_level <= 10:
        # Phase 1: Add exactly 50 MP for each level under 10, starting from the random base
        return start + ((current_level - 1) * 50)
    else:
        # Phase 2: From Level 11 to 99, swoop up to 9999
        level_10_mp = start + (9 * 50)
        progress = (current_level - 10) / 89.0
        curved_progress = progress ** 2.5 
        return int(round(level_10_mp + curved_progress * (end - level_10_mp)))

def run_updater():
    if not os.path.exists(FILENAME):
        print(f"Error: Could not find '{FILENAME}' in the current directory.")
        return

    with open(FILENAME, 'r', encoding='utf-8') as file:
        data = json.load(file)

    with open(BACKUP_FILENAME, 'w', encoding='utf-8') as backup_file:
        json.dump(data, backup_file, ensure_ascii=False)
    print(f"Backup created at '{BACKUP_FILENAME}'\n")

    updated_count = 0

    for cls in data:
        if not cls:
            continue
            
        name = cls.get('name', 'Unknown')
        note = cls.get('note', '')
        params = cls.get('params', [])

        if len(params) < 2:
            continue

        mp_curve = params[1]
        max_level = min(100, len(mp_curve))

        if max_level <= 1:
            continue

        # Route 1: Magical (Base 100, random variance +/- 20)
        if re.search(r'<Nature:\s*Magical>', note, re.IGNORECASE):
            random_start = random.randint(80, 120)
            
            for lvl in range(1, max_level):
                mp_curve[lvl] = calculate_magical_curve(random_start, lvl)
            
            print(f"[{name}] UPDATED (Magical Custom Curve):")
            print(f"   -> Level  1 MP: {mp_curve[1]} (Randomized)")
            print(f"   -> Level  2 MP: {mp_curve[2]} (+50)")
            print(f"   -> Level 10 MP: {mp_curve[10]} (+50 per level locked)")
            print(f"   -> Level 50 MP: {mp_curve[50]}")
            print(f"   -> Level 99 MP: {mp_curve[99]}\n")
            updated_count += 1

        # Route 2: Both (Base 70, random variance +/- 15)
        elif re.search(r'<Nature:\s*Both>', note, re.IGNORECASE):
            random_start = random.randint(55, 85)
            end = 5000
            
            for lvl in range(1, max_level):
                mp_curve[lvl] = calculate_standard_curve(random_start, end, lvl)
                
            print(f"[{name}] UPDATED (Both - Unchanged Slow Curve):")
            print(f"   -> Level  1 MP: {mp_curve[1]} (Randomized)")
            print(f"   -> Level 99 MP: {mp_curve[99]}\n")
            updated_count += 1

        # Route 3: Mundane (Base 50, random variance +/- 10)
        elif re.search(r'<Nature:\s*Mundane>', note, re.IGNORECASE):
            random_start = random.randint(40, 60)
            end = 1000
            
            for lvl in range(1, max_level):
                mp_curve[lvl] = calculate_standard_curve(random_start, end, lvl)
                
            print(f"[{name}] UPDATED (Mundane - Unchanged Slow Curve):")
            print(f"   -> Level  1 MP: {mp_curve[1]} (Randomized)")
            print(f"   -> Level 99 MP: {mp_curve[99]}\n")
            updated_count += 1

    with open(FILENAME, 'w', encoding='utf-8') as file:
        json.dump(data, file, ensure_ascii=False, separators=(',', ':'))

    print(f"Success! {updated_count} classes successfully updated.")

if __name__ == "__main__":
    run_updater()