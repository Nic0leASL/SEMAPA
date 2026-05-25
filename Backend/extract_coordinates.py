import os
import json
import pandas as pd

CSV_PATH = r"c:\Users\manuc\Universidad\Sistemas distribuidos\Cassandra\SEMAPA\Backend\datos\03 Practica 5 Recursos infraestructuras_cochabamba.csv"
OUTPUT_JSON_PATH = r"c:\Users\manuc\Universidad\Sistemas distribuidos\Cassandra\SEMAPA\Backend\datos\infraestructuras_coordenadas.json"
DASHBOARD_JSON_PATH = r"c:\Users\manuc\Universidad\Sistemas distribuidos\Cassandra\SEMAPA\Dasboard\public\infraestructuras_coordenadas.json"

def extract_coords():
    print(f"Reading original CSV from: {CSV_PATH}...")
    if not os.path.exists(CSV_PATH):
        print("Error: Original CSV file not found!")
        return

    # Read CSV with latin1 to handle Spanish characters correctly
    df = pd.read_csv(CSV_PATH, encoding='latin1')
    print(f"Original shape: {df.shape}")

    # Drop rows without valid coordinates
    df = df.dropna(subset=['latitud', 'longitud'])

    # Build optimized JSON structure with short keys
    records = []
    for _, row in df.iterrows():
        records.append({
            "c": str(row['numero_catastro']),
            "d": str(row['direccion']),
            "lat": float(row['latitud']),
            "lng": float(row['longitud']),
            "dist": int(row['distrito'])
        })

    # Save to Backend datos folder
    print(f"Saving JSON to: {OUTPUT_JSON_PATH}...")
    with open(OUTPUT_JSON_PATH, 'w', encoding='utf-8') as f:
        json.dump(records, f, ensure_ascii=False)

    # Save to Dashboard public folder directly!
    print(f"Saving JSON to: {DASHBOARD_JSON_PATH}...")
    with open(DASHBOARD_JSON_PATH, 'w', encoding='utf-8') as f:
        json.dump(records, f, ensure_ascii=False)

    print("Success! JSON coordinates exported and placed in both folders.")

if __name__ == '__main__':
    extract_coords()
