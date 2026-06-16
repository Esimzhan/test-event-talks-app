import os
import time
import urllib.request
import urllib.error
import xml.etree.ElementTree as ET
from flask import Flask, jsonify, render_template, request

app = Flask(__name__)

FEED_URL = "https://docs.cloud.google.com/feeds/bigquery-release-notes.xml"
CACHE_DURATION = 600  # Cache for 10 minutes

# In-memory cache fallback
_cache = {
    "data": None,
    "last_fetched": 0
}

def fetch_feed_data():
    """Fetches the XML feed from Google Cloud and parses it."""
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
    }
    req = urllib.request.Request(FEED_URL, headers=headers)
    
    try:
        # Fetch content with timeout
        with urllib.request.urlopen(req, timeout=15) as response:
            xml_content = response.read()
    except urllib.error.URLError as e:
        raise RuntimeError(f"Network error fetching feed: {e.reason}")
    except Exception as e:
        raise RuntimeError(f"Connection error: {str(e)}")
        
    try:
        root = ET.fromstring(xml_content)
    except ET.ParseError as e:
        raise RuntimeError(f"XML parse error: {str(e)}")
        
    # Atom Feed Namespace
    ns = {'atom': 'http://www.w3.org/2005/Atom'}
    entries = []
    
    for entry in root.findall('atom:entry', ns):
        # Extract fields safely
        entry_id_elem = entry.find('atom:id', ns)
        title_elem = entry.find('atom:title', ns)
        updated_elem = entry.find('atom:updated', ns)
        content_elem = entry.find('atom:content', ns)
        
        # Link extraction
        link_elem = entry.find("atom:link[@rel='alternate']", ns)
        if link_elem is None:
            link_elem = entry.find("atom:link", ns)
        link = link_elem.attrib.get('href', '') if link_elem is not None else ''
        
        entries.append({
            "id": entry_id_elem.text if entry_id_elem is not None else '',
            "title": title_elem.text if title_elem is not None else '',
            "updated": updated_elem.text if updated_elem is not None else '',
            "content": content_elem.text if content_elem is not None else '',
            "link": link
        })
        
    return entries

def get_releases(force_refresh=False):
    """Retrieves release notes, utilizing cache if valid."""
    now = time.time()
    
    # Check if cache is valid and refresh not forced
    if not force_refresh and _cache["data"] is not None and (now - _cache["last_fetched"]) < CACHE_DURATION:
        return _cache["data"], "cache_hit"
        
    try:
        entries = fetch_feed_data()
        _cache["data"] = entries
        _cache["last_fetched"] = now
        return entries, "fetched"
    except Exception as e:
        # Fallback to cache if request fails
        if _cache["data"] is not None:
            return _cache["data"], f"error_fallback_to_cache: {str(e)}"
        raise e

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/releases')
def api_releases():
    force_refresh = request.args.get('refresh', 'false').lower() == 'true'
    try:
        data, status_info = get_releases(force_refresh=force_refresh)
        last_updated_str = time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(_cache["last_fetched"]))
        return jsonify({
            "success": True,
            "source": status_info,
            "last_updated": last_updated_str,
            "releases": data
        })
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

if __name__ == '__main__':
    # Bind to localhost
    app.run(debug=True, host='127.0.0.1', port=5000)
