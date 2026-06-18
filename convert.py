import json
import csv
import re
import urllib.request
import os
import sys

J_FN = 'members.json'
C_FN = 'members.csv'
CFG_FN = 'config.json'


def dl_drive_img(url, save_path):
    if not url:
        return False
    match = re.search(r'[?&]id=([a-zA-Z0-9_-]+)', url)
    if not match:
        match = re.search(r'/d/([a-zA-Z0-9_-]+)', url)
    download_url = f'https://drive.google.com/uc?id={match.group(1)}&export=download' if match else url
    try:
        req = urllib.request.Request(download_url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req) as response:
            if 'text/html' in response.headers.get('Content-Type', ''):
                print("-> Failed: Google Drive link is private. Please set the folder sharing to 'Anyone with the link'.")
                return False
            with open(save_path, 'wb') as out_f:
                out_f.write(response.read())
        return True
    except Exception as e:
        print(f"-> Error downloading photo: {e}")
        return False


def load_json(filename):
    if os.path.exists(filename):
        try:
            with open(filename, 'r', encoding='utf-8') as jf:
                return json.load(jf)
        except json.JSONDecodeError:
            print(f"Error: {filename} contains invalid JSON.")
            return []
    return []


def save_json(filename, data):
    with open(filename, 'w', encoding='utf-8') as jf:
        json.dump(data, jf, indent=4)


def load_config():
    # Load configuration or create default mappings if missing
    if os.path.exists(CFG_FN):
        return load_json(CFG_FN)
    
    def_cfg = {
        "mappings": {}
    }
    save_json(CFG_FN, def_cfg)
    return def_cfg


def get_field(row, pos_keys):
    for key in pos_keys:
        if key in row:
            return row[key]
    return ''


def json_to_csv():
    data = load_json(J_FN)
    if not data:
        print("No data found in JSON to convert.")
        return

    try:
        with open(C_FN, 'w', newline='', encoding='utf-8') as cf:
            fields = list(data[0].keys())
            writer = csv.DictWriter(cf, fieldnames=fields, extrasaction='ignore')
            writer.writeheader()
            for item in data:
                writer.writerow(item)
        print("JSON to CSV conversion completed.")
    except Exception as e:
        print(f"Error writing to CSV: {e}")


def csv_to_json():
    # Import a CSV file into the JSON dataset, avoiding duplicates
    csv_fn = input(f"Enter CSV filename to import (leave blank for '{C_FN}'): ").strip()
    if not csv_fn:
        csv_fn = C_FN

    if not os.path.exists(csv_fn):
        print(f"Error: {csv_fn} does not exist.")
        return

    ext_data = load_json(J_FN)

    # Preload existing unique keys to prevent adding duplicates
    ext_names = {str(m.get('name', '')).strip().lower() for m in ext_data if str(m.get('name', '')).strip()}
    ext_emails = {str(m.get('email', '')).strip().lower() for m in ext_data if str(m.get('email', '')).strip()}
    ext_phones = {str(m.get('phone', '')).strip() for m in ext_data if str(m.get('phone', '')).strip()}

    config = load_config()
    mappings = config.get('mappings', {})

    next_id = max((int(m.get('id', 0)) for m in ext_data), default=0) + 1
    added_count = 0

    try:
        with open(csv_fn, newline='', encoding='utf-8') as cf:
            reader = csv.DictReader(cf)
            for row in reader:
                row_data = {}
                for json_key, csv_headers in mappings.items():
                    row_data[json_key] = get_field(row, csv_headers).strip()

                if not any(row_data.values()):
                    continue

                name = row_data.get('name', '')
                email = row_data.get('email', '')
                phone = row_data.get('phone', '')

                # Skip records that already exist
                if name and name.lower() in ext_names:
                    continue
                if email and email.lower() in ext_emails:
                    continue
                if phone and phone in ext_phones:
                    continue

                if name:
                    safe_name = re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')
                else:
                    safe_name = f"user-{next_id}"

                pic_path = row_data.get('photo', '')
                if not pic_path:
                    pic_path = f"members/{safe_name}.png"
                
                up_url = row_data.get('upload_url', '')
                if up_url and safe_name:
                    print(f"Downloading photo for {name}...")
                    os.makedirs('members', exist_ok=True)
                    new_pic_path = f"members/{safe_name}.png"
                    if dl_drive_img(up_url, new_pic_path):
                        pic_path = new_pic_path
                    else:
                        print(f"  -> Falling back to placeholder for {name}")

                n_item = {k: v for k, v in row_data.items() if k != 'upload_url'}
                n_item['photo'] = pic_path
                n_item['id'] = next_id

                ext_data.append(n_item)

                if name: ext_names.add(name.lower())
                if email: ext_emails.add(email.lower())
                if phone: ext_phones.add(phone)

                next_id += 1
                added_count += 1

        # Sort final output alphabetically
        ext_data = sorted(ext_data, key=lambda x: str(x.get('name', '')).lower())
        save_json(J_FN, ext_data)
        print(f"CSV to JSON conversion completed. {added_count} new members added, data preserved.")

    except Exception as e:
        print(f"Error reading CSV: {e}")


def edit_config():
    config = load_config()
    mappings = config.get('mappings', {})
    
    print("\nEnter the name of the JSON column to edit or add (leave blank to cancel):")
    key = input("Column Name: ").strip()
    if not key:
        print("Cancelled.")
        return
        
    print(f"Enter comma-separated CSV headers for '{key}' (leave blank to just use '{key}'):")
    headers_input = input("Headers: ").strip()
    
    if headers_input:
        mappings[key] = [h.strip() for h in headers_input.split(',') if h.strip()]
    else:
        mappings[key] = [key]
        
    config['mappings'] = mappings
    save_json(CFG_FN, config)
    print("Configuration updated successfully.")


def clear_config():
    confirm = input("Are you sure you want to clear all configuration mappings? (y/n): ").strip().lower()
    if confirm == 'y':
        save_json(CFG_FN, {"mappings": {}})
        print("Configuration cleared successfully.")
    else:
        print("Cancelled.")


def main():
    while True:
        print("\n--- Member Management System ---")
        print("1. Convert JSON to CSV")
        print("2. Convert CSV to JSON")
        print("3. Edit configuration")
        print("4. Clear configuration")
        print("5. Exit program")
        
        choice = input("Enter Choice: ").strip()
        
        if choice == '1':
            json_to_csv()
        elif choice == '2':
            csv_to_json()
        elif choice == '3':
            edit_config()
        elif choice == '4':
            clear_config()
        elif choice == '5':
            print("Exiting program. Goodbye!")
            sys.exit(0)
        else:
            print("Invalid choice. Please try again.")


if __name__ == '__main__':
    main()