import geopandas as gpd
import pandas as pd

shp_path = r"e:\31_animacion_od\2023-matrices_entregado MML\Zonas2020 2024-10-30.shp"
public_path = r"e:\31_animacion_od\2023-matrices_entregado MML\2023-matrix-publico-AM-viajes.csv"

gdf = gpd.read_file(shp_path)
df_pub = pd.read_csv(public_path, header=None)

matrix_ids = set(df_pub[0].unique())

print("Number of unique matrix IDs:", len(matrix_ids))
print("Sample matrix IDs:", list(matrix_ids)[:10])

matching_columns = {}
for col in gdf.columns:
    if col == 'geometry':
        continue
    # try converting to int or check direct match
    try:
        shp_ids = set(gdf[col].dropna().astype(int).unique())
    except:
        shp_ids = set(gdf[col].dropna().unique())
        
    overlap = len(matrix_ids.intersection(shp_ids))
    if overlap > 0:
        matching_columns[col] = {
            'overlap': overlap,
            'total_shp_unique': len(shp_ids),
            'sample_shp': list(shp_ids)[:10]
        }

print("\nMatching columns in shapefile:")
for col, info in matching_columns.items():
    print(f"Column: {col} -> Overlap: {info['overlap']} / {len(matrix_ids)} (Shapefile unique values: {info['total_shp_unique']})")
    print(f"  Sample: {info['sample_shp']}")
