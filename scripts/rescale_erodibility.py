import json
import argparse

def rescale_erodibility(input_file, output_file, old_min, old_max, new_min, new_max):
    # Read the input JSON file
    with open(input_file, 'r') as file:
        data = json.load(file)

    # Function to rescale a value
    def rescale(value, old_min, old_max, new_min, new_max):
        return new_min + ((value - old_min) / (old_max - old_min)) * (new_max - new_min)

    # Update the 'erodibility' field in each item
    for item in data:
        if 'erodibility' in item:
            item['erodibility'] = rescale(item['erodibility'], old_min, old_max, new_min, new_max)

    # Write the updated data to the output JSON file
    with open(output_file, 'w') as file:
        json.dump(data, file)

def main():
    parser = argparse.ArgumentParser(description="Rescale erodibility values in a JSON file.")
    parser.add_argument("input_file", help="Path to the input JSON file")
    parser.add_argument("output_file", help="Path to the output JSON file")
    parser.add_argument("old_min", type=float, help="Minimum value of the old range")
    parser.add_argument("old_max", type=float, help="Maximum value of the old range")
    parser.add_argument("new_min", type=float, help="Minimum value of the new range")
    parser.add_argument("new_max", type=float, help="Maximum value of the new range")
    args = parser.parse_args()
    rescale_erodibility(args.input_file, args.output_file, args.old_min, args.old_max, args.new_min, args.new_max)

if __name__ == "__main__":
    main()

# example usage:
# python rescale_erodibility.py ../public/template1_old.json ../public/template1.json 0.2 0.9 0.1 1.5