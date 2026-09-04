import json
import re
import sys


def _extract_boxed(text: str) -> str | None:
    """Extract content from \\boxed{ ... }, handling nested braces."""
    match = re.search(r"\\?boxed\s*\{", text)
    if not match:
        return None
    start = match.end()
    depth = 1
    for i in range(start, len(text)):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                return text[start:i].strip()
    return None


def _extract_last_json_block(text: str) -> str | None:
    """Extract the last ```json ... ``` fenced code block."""
    # Find all ```json blocks and take the last one (most likely the final answer)
    blocks = list(re.finditer(r"```(?:json)?\s*\n(.*?)```", text, re.DOTALL))
    if blocks:
        return blocks[-1].group(1).strip()
    return None


def _extract_last_raw_json(text: str) -> str | None:
    """Find the last valid JSON object in the text by scanning for top-level braces."""
    # Search from the end for the last closing brace, then match it backwards
    i = len(text) - 1
    while i >= 0:
        if text[i] == "}":
            # Walk backwards to find the matching opening brace
            end = i
            depth = 1
            j = i - 1
            while j >= 0 and depth > 0:
                if text[j] == "}":
                    depth += 1
                elif text[j] == "{":
                    depth -= 1
                j -= 1
            if depth == 0:
                candidate = text[j + 1 : end + 1].strip()
                try:
                    data = json.loads(candidate)
                    if isinstance(data, dict) and ("spaces" in data or "output" in data):
                        return candidate
                except json.JSONDecodeError:
                    pass
                # Skip past this object and keep searching
                i = j
            else:
                i -= 1
        else:
            i -= 1
    return None


def _strip_code_fences(content: str) -> str:
    """Strip markdown code fences if present."""
    content = re.sub(r"^```(?:json)?\s*", "", content)
    content = re.sub(r"\s*```\s*$", "", content)
    return content.strip()


def _extract_json_content(text: str) -> str:
    """Extract JSON content using multiple strategies in order of preference."""
    # Strategy 1: \boxed{} tag (with or without backslash)
    boxed = _extract_boxed(text)
    if boxed is not None:
        return _strip_code_fences(boxed)

    # Strategy 2: Last ```json ... ``` or ``` ... ``` code block
    json_block = _extract_last_json_block(text)
    if json_block is not None:
        return json_block

    # Strategy 3: Last raw JSON object containing "spaces" or "output"
    raw_json = _extract_last_raw_json(text)
    if raw_json is not None:
        return raw_json

    raise ValueError("Could not extract JSON: no \\boxed{} tag, code block, or raw JSON object found.")


def extract_boxed_output(input_json_path: str, output_json_path: str):
    with open(input_json_path, "r") as f:
        text = f.read()

    json_content = _extract_json_content(text)

    try:
        data = json.loads(json_content)
    except json.JSONDecodeError as e:
        print(f"JSON parsing error: {e}")
        print(f"Problematic content:\n{json_content[:500]}")
        raise ValueError(f"Failed to parse JSON content: {e}")

    if "output" in data:
        output_data = data["output"]
    elif "spaces" in data:
        output_data = data
    else:
        print(f"Unexpected JSON structure. Available keys: {list(data.keys())}")
        raise ValueError("The parsed JSON contains neither 'output' nor 'spaces' key.")

    with open(output_json_path, "w") as f:
        json.dump(output_data, f, indent=2)

    print(f"Extracted output saved to {output_json_path}")


if __name__ == "__main__":
    if len(sys.argv) == 3:
        extract_boxed_output(sys.argv[1], sys.argv[2])
    else:
        print("Usage: python extract_boxed_json.py <input_path> <output_path>")
