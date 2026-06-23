import geopandas as gpd
import pandas as pd

shp_path = r"e:\31_animacion_od\2023-matrices_entregado MML\Zonas2020 2024-10-30.shp"
public_path = r"e:\31_animacion_od\2023-matrices_entregado MML\2023-matrix-publico-AM-viajes.csv"

gdf = gpd.read_file(shp_path)
df_pub = pd.read_csv(public_path, header=None)

matrix_ids = set(df_pub[0].unique())

print("Matrix ID range:", min(matrix_ids), "to", max(matrix_ids))
print("Number of unique matrix IDs:", len(matrix_ids))

test_cols = ['ID', 'ID1', 'OBJECTID_1', 'OBJECTID', 'ID_BGD', 'ID_1195', 'ID_PM', 'ID_JICA05', 'ID_JICA12', 'ID_L3', 'ID_L4', 'ID_DUM', 'MACROZONA']

for col in test_cols:
    if col in gdf.columns:
        shp_ids = set(gdf[col].dropna().astype(int).unique())
        overlap = len(matrix_ids.intersection(shp_ids))
        print(f"Column: {col:15} -> Overlap: {overlap} / {len(matrix_ids)} (Shapefile unique: {len(shp_ids)})")
        # Check mismatch details
        missing_in_shp = matrix_ids - shp_ids
        missing_in_matrix = shp_ids - matrix_ids
        print(f"  Missing in Shapefile: {list(missing_in_shp)[:10]} (total: {len(missing_in_shp)})")
        print(f"  Missing in Matrix: {list(missing_in_matrix)[:10]} (total: {len(missing_in_matrix)})")
