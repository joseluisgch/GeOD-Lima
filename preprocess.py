import os
import json
import geopandas as gpd
import pandas as pd

# Paths
shp_path = r"e:\31_animacion_od\2023-matrices_entregado MML\Zonas2020 2024-10-30.shp"
public_path = r"e:\31_animacion_od\2023-matrices_entregado MML\2023-matrix-publico-AM-viajes.csv"
privado_path = r"e:\31_animacion_od\2023-matrices_entregado MML\2023-matrix-privado(autoytaxi)-AM-vehiculos.csv"
camiones_path = r"e:\31_animacion_od\2023-matrices_entregado MML\2023-matrix-camiones(3categoriaas)-AM-vehiculos.csv"

output_dir = r"e:\31_animacion_od\public\data"
os.makedirs(output_dir, exist_ok=True)

print("--- STEP 1: PROCESSING GEOMETRIES ---")
# Read shapefile
print("Reading shapefile...")
gdf = gpd.read_file(shp_path)

# Verify CRS is WGS84
if gdf.crs.to_epsg() != 4326:
    print(f"Reprojecting shapefile from CRS {gdf.crs} to EPSG:4326...")
    gdf = gdf.to_crs(epsg=4326)
else:
    print("Shapefile is already EPSG:4326 (WGS84).")

# Clean district names
gdf['DISTRITO'] = gdf['DISTRITO'].fillna('DESCONOCIDO').str.strip()

# Calculate zone centroids
print("Calculating zone centroids...")
gdf['lon'] = gdf.geometry.centroid.x
gdf['lat'] = gdf.geometry.centroid.y

# Check ID column matches matrix keys (which are integers)
gdf['ID'] = gdf['ID'].astype(int)

# Build zone to district mapping dictionary
zone_to_district = gdf.set_index('ID')['DISTRITO'].to_dict()

# Save zone locations
zone_locations = []
for idx, row in gdf.iterrows():
    zone_locations.append({
        "id": int(row['ID']),
        "name": f"Zona {row['ID']} ({row['DISTRITO']})",
        "lat": float(row['lat']),
        "lon": float(row['lon']),
        "district": row['DISTRITO']
    })

locations_zones_path = os.path.join(output_dir, "locations_zones.json")
with open(locations_zones_path, 'w', encoding='utf-8') as f:
    json.dump(zone_locations, f, indent=2, ensure_ascii=False)
print(f"Saved {len(zone_locations)} zone locations to {locations_zones_path}")

# Calculate district centroids
print("Calculating district centroids...")
gdf_districts = gdf.dissolve(by='DISTRITO')
gdf_districts['lon'] = gdf_districts.geometry.centroid.x
gdf_districts['lat'] = gdf_districts.geometry.centroid.y

district_locations = []
for district_name, row in gdf_districts.iterrows():
    district_locations.append({
        "id": str(district_name),
        "name": str(district_name),
        "lat": float(row['lat']),
        "lon": float(row['lon'])
    })

locations_districts_path = os.path.join(output_dir, "locations_districts.json")
with open(locations_districts_path, 'w', encoding='utf-8') as f:
    json.dump(district_locations, f, indent=2, ensure_ascii=False)
print(f"Saved {len(district_locations)} district locations to {locations_districts_path}")


print("\n--- STEP 2: PROCESSING MOBILITY MATRICES ---")

def process_matrix(csv_path, mode_name, zone_threshold, is_trucks=False):
    print(f"\nProcessing {mode_name} matrix from {csv_path}...")
    
    if is_trucks:
        # Columns: 0=origin, 1=dest, 2=light, 3=heavy, 4=trailer
        df = pd.read_csv(csv_path, header=None, names=['origin', 'dest', 'light', 'heavy', 'trailer'])
        df['count'] = df['light'] + df['heavy'] + df['trailer']
        df = df[['origin', 'dest', 'count']]
    else:
        df = pd.read_csv(csv_path, header=None, names=['origin', 'dest', 'count'])
    
    # Cast origin and dest to int
    df['origin'] = df['origin'].astype(int)
    df['dest'] = df['dest'].astype(int)
    
    # Filter out zero/negative values
    df = df[df['count'] > 0]
    print(f"Total non-zero flows: {len(df)}")
    
    # 1. District-level aggregation
    print("Aggregating to district level...")
    df_dist = df.copy()
    df_dist['origin_dist'] = df_dist['origin'].map(zone_to_district)
    df_dist['dest_dist'] = df_dist['dest'].map(zone_to_district)
    
    # Filter out flows with missing district mapping
    df_dist = df_dist.dropna(subset=['origin_dist', 'dest_dist'])
    
    # Group by district names
    df_dist_grouped = df_dist.groupby(['origin_dist', 'dest_dist'])['count'].sum().reset_index()
    
    # Rename columns to standard flow format
    df_dist_grouped.columns = ['origin', 'dest', 'count']
    
    # Round count to 3 decimals
    df_dist_grouped['count'] = df_dist_grouped['count'].round(3)
    
    # Sort by count descending
    df_dist_grouped = df_dist_grouped.sort_values(by='count', ascending=False)
    
    # Convert to list of dicts
    dist_flows = df_dist_grouped.to_dict(orient='records')
    
    dist_flows_path = os.path.join(output_dir, f"flows_districts_{mode_name}.json")
    with open(dist_flows_path, 'w', encoding='utf-8') as f:
        json.dump(dist_flows, f, indent=2, ensure_ascii=False)
    print(f"Saved {len(dist_flows)} district flows to {dist_flows_path}")
    
    # 2. Zone-level processing and filtering
    print(f"Filtering zone flows with threshold >= {zone_threshold}...")
    df_zone_filtered = df[df['count'] >= zone_threshold].copy()
    df_zone_filtered['count'] = df_zone_filtered['count'].round(3)
    df_zone_filtered = df_zone_filtered.sort_values(by='count', ascending=False)
    
    zone_flows = df_zone_filtered.to_dict(orient='records')
    
    zone_flows_path = os.path.join(output_dir, f"flows_zones_{mode_name}.json")
    with open(zone_flows_path, 'w', encoding='utf-8') as f:
        json.dump(zone_flows, f, indent=2, ensure_ascii=False)
    print(f"Saved {len(zone_flows)} zone flows to {zone_flows_path} (threshold={zone_threshold})")

# Run processing for each matrix with specific thresholds to get a high-quality visualization
# - Public transport: >= 2.0 voyages (keeps ~35,000 flows)
# - Private transport: >= 0.5 vehicles (keeps ~40,000 flows)
# - Cargo trucks: >= 0.02 vehicles (keeps ~32,000 flows)
process_matrix(public_path, "publico", zone_threshold=2.0)
process_matrix(privado_path, "privado", zone_threshold=0.5)
process_matrix(camiones_path, "camiones", zone_threshold=0.02, is_trucks=True)

print("\n--- GEOPROCESSING COMPLETE ---")
