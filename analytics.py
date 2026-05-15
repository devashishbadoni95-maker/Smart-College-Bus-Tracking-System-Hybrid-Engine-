import sys
import json
from geopy.distance import geodesic

# College ke fixed stops ke coordinates
STOP_COORDS = {
    "Main Gate": (28.6139, 77.2090),
    "Hostel A": (28.6200, 77.2100),
    "Library": (28.6250, 77.2150)
}

def process_data():
    try:
        # Standard input se data read karna
        raw_input = sys.stdin.read()
        
        # Check agar data khali hai toh crash na ho
        if not raw_input.strip():
            return

        input_data = json.loads(raw_input)
        
        # Bus ki current location (lat, lng)
        bus_lat = input_data.get('bus_lat')
        bus_lng = input_data.get('bus_lng')
        students = input_data.get('students', [])

        if bus_lat is None or bus_lng is None:
            print(json.dumps({"error": "Missing bus coordinates"}))
            return

        bus_loc = (bus_lat, bus_lng)
        results = {}

        for student in students:
            student_id = student.get('id')
            stop_name = student.get('stop')

            if stop_name in STOP_COORDS:
                # Geopy se distance nikaalna (Kilometers mein)
                dist = geodesic(bus_loc, STOP_COORDS[stop_name]).km
                
                # ETA calculation (Average speed 20km/h maan kar)
                # Formula: (Distance / Speed) * 60 minutes
                eta_minutes = round((dist / 20) * 60)
                
                results[student_id] = {
                    "distance": f"{dist:.2f} km",
                    "eta": f"{eta_minutes} mins",
                    "stop": stop_name
                }
            else:
                # Agar stop match nahi hota
                results[student_id] = {
                    "distance": "N/A",
                    "eta": "Calculating...",
                    "stop": stop_name or "Not Set"
                }
        
        # Final result JSON format mein bhejna Node.js ko
        print(json.dumps(results))
        sys.stdout.flush() # Buffer clear karna zaroori hai

    except Exception as e:
        # Koi bhi error aaye toh JSON format mein return karein
        print(json.dumps({"error": str(e)}))
        sys.stdout.flush()

if __name__ == "__main__":
    process_data()
