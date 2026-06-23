import pandas as pd
import numpy as np

public_path = r"e:\31_animacion_od\2023-matrices_entregado MML\2023-matrix-publico-AM-viajes.csv"
privado_path = r"e:\31_animacion_od\2023-matrices_entregado MML\2023-matrix-privado(autoytaxi)-AM-vehiculos.csv"
camiones_path = r"e:\31_animacion_od\2023-matrices_entregado MML\2023-matrix-camiones(3categoriaas)-AM-vehiculos.csv"

def analyze_csv(path, is_trucks=False):
    print(f"\nAnalyzing: {path}")
    if is_trucks:
        # Columns: origin, dest, cat1, cat2, cat3
        df = pd.read_csv(path, header=None)
        print("Total rows:", len(df))
        df['total'] = df[2] + df[3] + df[4]
        non_zero = df[df['total'] > 0]
        print("Non-zero rows (total > 0):", len(non_zero))
        print("Summary of total trucks:")
        print(non_zero['total'].describe(percentiles=[0.5, 0.75, 0.9, 0.95, 0.99]))
    else:
        df = pd.read_csv(path, header=None)
        print("Total rows:", len(df))
        non_zero = df[df[2] > 0]
        print("Non-zero rows:", len(non_zero))
        print("Summary of flows:")
        print(non_zero[2].describe(percentiles=[0.5, 0.75, 0.9, 0.95, 0.99]))

analyze_csv(public_path)
analyze_csv(privado_path)
analyze_csv(camiones_path, is_trucks=True)
