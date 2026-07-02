import json
from collections import Counter

def find_duplicates(data, path=""):
    if isinstance(data, dict):
        keys = list(data.keys())
        duplicates = [k for k, v in Counter(keys).items() if v > 1]
        for k in duplicates:
            print(f"Duplicate key found: '{path}{k}'")
        
        for k, v in data.items():
            find_duplicates(v, f"{path}{k}.")

with open('src/locales/en.json', 'r') as f:
    # json.load normally overrides duplicates, so we need a custom decoder
    def dict_raise_on_duplicates(ordered_pairs):
        """Reject duplicate keys."""
        d = {}
        for k, v in ordered_pairs:
            if k in d:
               print(f"DUPLICATE KEY IN JSON: {k}")
            d[k] = v
        return d

    json.load(f, object_pairs_hook=dict_raise_on_duplicates)
