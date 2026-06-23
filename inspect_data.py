import geopandas as gpd
import pandas as pd
import os

shp_path = r"e:\31_animacion_od\2023-matrices_entregado MML\Zonas2020 2024-10-30.shp"
public_path = r"e:\31_animacion_od\2023-matrices_entregado MML\2023-matrix-publico-AM-viajes.csv"
privado_path = r"e:\31_animacion_od\2023-matrices_entregado MML\2023-matrix-privado(autoytaxi)-AM-vehiculos.csv"
camiones_path = r"e:\31_animacion_od\2023-matrices_entregado MML\2023-matrix-camiones(3categoriaas)-AM-vehiculos.csv"

print("--- SHAPEFILE INSPECTION ---")
try:
    gdf = gpd.read_file(shp_path)
    print("CRS:", gdf.crs)
    print("Columns:", gdf.columns.tolist())
    print("Shapefile shape:", gdf.shape)
    print("First 5 rows:")
    print(gdf.head())
    
    # Check if ID_1119 column exists and some values
    if "ID_1119" in gdf.columns:
        print("\nID_1119 description:")
        print(gdf["ID_1119"].describe())
        print("Sample ID_1119 values:", gdf["ID_1119"].head(10).tolist())
    else:
        print("\nID_1119 NOT FOUND! Columns are:", gdf.columns)
except Exception as e:
    print("Error reading shapefile:", e)

print("\n--- PUBLIC MATRIX INSPECTION ---")
try:
    df_pub = pd.read_csv(public_path, nrows=5, header=None)
    print("Public matrix headers/first 5 rows (no header):")
    print(df_pub)
    
    # Let's count total lines (we know it's about 1.46M from the line numbers, but let's check size/shape)
    print("Reading complete public matrix shape...")
    df_pub_full = pd.read_csv(public_path, header=None)
    print("Public matrix shape:", df_pub_full.shape)
    print("Public matrix unique origins:", df_pub_full[0].nunique())
    print("Public matrix unique destinations:", df_pub_full[1].nunique())
    print("Public matrix values summary:")
    print(df_pub_full[2].describe())
except Exception as e:
    print("Error reading public matrix:", e)

print("\n--- PRIVATE MATRIX INSPECTION ---")
try:
    df_priv = pd.read_csv(privado_path, nrows=5, header=None)
    print("Private matrix headers/first 5 rows:")
    print(df_priv)
    df_priv_full = pd.read_csv(privado_path, header=None)
    print("Private matrix shape:", df_priv_full.shape)
except Exception as e:
    print("Error reading private matrix:", e)

print("\n--- CAMIONES MATRIX INSPECTION ---")
try:
    df_cam = pd.read_csv(camiones_path, nrows=5, header=None)
    print("Camiones matrix headers/first 5 rows:")
    print(df_cam)
    df_cam_full = pd.read_csv(camiones_path, header=None)
    print("Camiones matrix shape:", df_cam_full.shape)
except Exception as e:
    print("Error reading camiones matrix:", e)
