
def check_braces(filename):
    with open(filename, 'r') as f:
        content = f.read()
    
    stack = []
    lines = content.split('\n')
    
    for i, line in enumerate(lines):
        for j, char in enumerate(line):
            if char == '{':
                stack.append((i+1, j+1))
            elif char == '}':
                if not stack:
                    print(f"Error: Unexpected closing brace at line {i+1}, col {j+1}")
                    return
                stack.pop()
    
    if stack:
        print(f"Error: Unclosed brace at line {stack[-1][0]}, col {stack[-1][1]}")
    else:
        print("Braces are balanced.")

check_braces('js/ui.js')
