import sys
import json
from geopy.distance import geodesic

# Aapke college ke stops ke coordinates
STOP_COORDS = {
    "Main Gate": (28.6139, 77.2090),
    "Hostel A": (28.6200, 77.2100),
    "Library": (28.6250, 77.2150)
}

def process_data():
    try:
        input_data = json.loads(sys.stdin.read())
        bus_loc = (input_data['bus_lat'], input_data['bus_lng'])
        results = {}

        for student in input_data['students']:
            stop_name = student['stop']
            if stop_name in STOP_COORDS:
                dist = geodesic(bus_loc, STOP_COORDS[stop_name]).km
                # Average speed 20km/h ke hisaab se ETA
                eta = round((dist / 20) * 60)
                results[student['id']] = {
                    "distance": f"{dist:.2f} km",
                    "eta": f"{eta} mins"
                }
        
        print(json.dumps(results))
    except Exception as e:
        print(json.dumps({"error": str(e)}))

if __name__ == "__main__":
    process_data()