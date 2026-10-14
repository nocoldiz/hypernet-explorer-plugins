import json
import os
import re
import random

FILENAME = 'classes.json'
BACKUP_FILENAME = 'classes.json.bak'

# Classes whose mana pool is a fixed number at every level.
FIXED_MP = {'Mechanic': 10}
# Classes of another nature that still get the Magical curve.
CASTER_BAR = {'Freelancer'}

def calculate_mundane_curve(start, current_level):
    """Mundane: +12 MP/level in first 30 levels, smoothly curving to 1000 at level 99."""
    end = 1000
    if current_level <= 1:
        return start
    if current_level >= 99:
        return end
    p1_end = 30
    p1_rate = 12
    p1_mp = start + (p1_end - 1) * p1_rate
    if current_level <= p1_end:
        return start + (current_level - 1) * p1_rate
    progress = (current_level - p1_end) / float(99 - p1_end)
    return int(round(p1_mp + (progress ** 0.9) * (end - p1_mp)))

def calculate_both_curve(start, current_level):
    """Both (hybrid): +40 MP/level in first 30 levels, smoothly curving to 5000 at level 99."""
    end = 5000
    if current_level <= 1:
        return start
    if current_level >= 99:
        return end
    p1_end = 30
    p1_rate = 40
    p1_mp = start + (p1_end - 1) * p1_rate
    if current_level <= p1_end:
        return start + (current_level - 1) * p1_rate
    progress = (current_level - p1_end) / float(99 - p1_end)
    return int(round(p1_mp + (progress ** 1.1) * (end - p1_mp)))

def calculate_magical_curve(start, current_level):
    """Magical: +60 MP/level in first 30 levels, smoothly curving to 9999 at level 99."""
    end = 9999
    if current_level <= 1:
        return start
    if current_level >= 99:
        return end
    p1_end = 30
    p1_rate = 60
    p1_mp = start + (p1_end - 1) * p1_rate
    if current_level <= p1_end:
        return start + (current_level - 1) * p1_rate
    progress = (current_level - p1_end) / float(99 - p1_end)
    return int(round(p1_mp + (progress ** 1.2) * (end - p1_mp)))

def find_file():
    candidates = [
        FILENAME,
        os.path.join(os.path.dirname(__file__), FILENAME),
        'Classes.json',
        os.path.join(os.path.dirname(__file__), 'Classes.json')
    ]
    for c in candidates:
        if os.path.exists(c):
            return c
    return None

def run_updater():
    target_file = find_file()
    if not target_file:
        print(f"Error: Could not find '{FILENAME}' or 'Classes.json'.")
        return

    backup_path = os.path.join(os.path.dirname(target_file), BACKUP_FILENAME)

    with open(target_file, 'r', encoding='utf-8') as file:
        data = json.load(file)

    with open(backup_path, 'w', encoding='utf-8') as backup_file:
        json.dump(data, backup_file, ensure_ascii=False)
    print(f"Backup created at '{backup_path}'\n")

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

        # The Mechanic's flat pool of ten is its class gimmick (it never casts),
        # also held by tools/classes/gen_class_params.js FIXED_MMP.
        if name in FIXED_MP:
            for lvl in range(1, max_level):
                mp_curve[lvl] = FIXED_MP[name]
            continue

        # Route 1: Magical (Base 100, random variance +/- 20)
        # The Freelancer studies under every school, magic included, so it carries
        # a caster's bar although its nature is Both (test/test_class_mp_tiers.js).
        if name in CASTER_BAR or re.search(r'<Nature:\s*Magical>', note, re.IGNORECASE):
            base_start = mp_curve[1] if (len(mp_curve) > 1 and mp_curve[1] and mp_curve[1] > 0) else random.randint(80, 120)
            
            for lvl in range(1, max_level):
                mp_curve[lvl] = calculate_magical_curve(base_start, lvl)
            
            print(f"[{name}] UPDATED (Magical Curve):")
            print(f"   -> Level  1 MP: {mp_curve[1]}")
            print(f"   -> Level 10 MP: {mp_curve[10]}")
            print(f"   -> Level 30 MP: {mp_curve[30]}")
            print(f"   -> Level 50 MP: {mp_curve[50]}")
            print(f"   -> Level 99 MP: {mp_curve[99]}\n")
            updated_count += 1

        # Route 2: Both (Base 70, random variance +/- 15)
        elif re.search(r'<Nature:\s*Both>', note, re.IGNORECASE):
            base_start = mp_curve[1] if (len(mp_curve) > 1 and mp_curve[1] and mp_curve[1] > 0) else random.randint(55, 85)
            
            for lvl in range(1, max_level):
                mp_curve[lvl] = calculate_both_curve(base_start, lvl)
                
            print(f"[{name}] UPDATED (Both Curve):")
            print(f"   -> Level  1 MP: {mp_curve[1]}")
            print(f"   -> Level 10 MP: {mp_curve[10]}")
            print(f"   -> Level 30 MP: {mp_curve[30]}")
            print(f"   -> Level 50 MP: {mp_curve[50]}")
            print(f"   -> Level 99 MP: {mp_curve[99]}\n")
            updated_count += 1

        # Route 3: Mundane (Base 50, random variance +/- 10)
        elif re.search(r'<Nature:\s*Mundane>', note, re.IGNORECASE):
            base_start = mp_curve[1] if (len(mp_curve) > 1 and mp_curve[1] and mp_curve[1] > 0) else random.randint(40, 60)
            
            for lvl in range(1, max_level):
                mp_curve[lvl] = calculate_mundane_curve(base_start, lvl)
                
            print(f"[{name}] UPDATED (Mundane Curve):")
            print(f"   -> Level  1 MP: {mp_curve[1]}")
            print(f"   -> Level 10 MP: {mp_curve[10]}")
            print(f"   -> Level 30 MP: {mp_curve[30]}")
            print(f"   -> Level 50 MP: {mp_curve[50]}")
            print(f"   -> Level 99 MP: {mp_curve[99]}\n")
            updated_count += 1

    formatted_rows = [
        'null' if r is None else json.dumps(r, ensure_ascii=False, separators=(',', ':'))
        for r in data
    ]
    with open(target_file, 'w', encoding='utf-8', newline='\n') as file:
        file.write('[\n' + ',\n'.join(formatted_rows) + '\n]')

    print(f"Success! {updated_count} classes successfully updated.")

if __name__ == "__main__":
    run_updater()