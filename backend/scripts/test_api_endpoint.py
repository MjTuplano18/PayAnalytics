"""
Test the chat conversations API endpoint.
"""
import requests

# Token generated from generate_test_token.py
TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJiN2YzNTEyZS0xMDBhLTQ3NDgtOWNjZC01OGM2NzliNTRhMTciLCJlbWFpbCI6InBheWFuYWx5dGljczg2QGdtYWlsLmNvbSIsImV4cCI6MTc3Njg0MzgxNn0.YV6_DuDS400B0TxtPuh503T4B01veTVNb-c_vGg4ttY"

def test_conversations_endpoint():
    """Test GET /api/v1/chat/conversations endpoint."""
    url = "http://localhost:8000/api/v1/chat/conversations"
    headers = {
        "Authorization": f"Bearer {TOKEN}",
        "Content-Type": "application/json"
    }
    
    print(f"Testing: {url}")
    print(f"Headers: Authorization: Bearer {TOKEN[:50]}...")
    
    try:
        response = requests.get(url, headers=headers, timeout=10)
        
        print(f"\n✅ Status Code: {response.status_code}")
        
        if response.status_code == 200:
            print("✅ SUCCESS! Endpoint is working correctly.")
            print(f"\nResponse Body:")
            print(response.json())
        elif response.status_code == 500:
            print("❌ FAILED! Still getting 500 Internal Server Error")
            print(f"\nResponse Body:")
            print(response.text)
        else:
            print(f"⚠️  Unexpected status code: {response.status_code}")
            print(f"\nResponse Body:")
            print(response.text)
            
    except requests.exceptions.ConnectionError:
        print("❌ ERROR: Could not connect to backend server at http://localhost:8000")
        print("Make sure the backend server is running.")
    except requests.exceptions.Timeout:
        print("❌ ERROR: Request timed out after 10 seconds")
    except Exception as e:
        print(f"❌ ERROR: {e}")

if __name__ == "__main__":
    test_conversations_endpoint()
