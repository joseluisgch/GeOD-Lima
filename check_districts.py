import geopandas as gpd

shp_path = r"e:\31_animacion_od\2023-matrices_entregado MML\Zonas2020 2024-10-30.shp"
gdf = gpd.read_file(shp_path)

print("Unique districts count:", gdf['DISTRITO'].nunique())
print("Unique districts:", sorted(gdf['DISTRITO'].dropna().unique()))
print("\nZones per district:")
print(gdf['DISTRITO'].value_counts())
