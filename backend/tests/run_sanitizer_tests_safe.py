import subprocess
import sys
import os

def run_tests():
    try:
        # Run pytest on the specific file and capture output
        # Using the path relative to the current working directory
        result = subprocess.run(
            [sys.executable, "-m", "pytest", "tests/test_sanitizer.py"],
            capture_output=True,
            text=True,
            cwd="backend" 
        )
        
        output = result.stdout + result.stderr
        
        # Replace characters that crash the Rich UI
        sanitized_output = output.replace("[", "【").replace("]", "】")
        
        print(sanitized_output)
        
        if result.returncode != 0:
            sys.exit(result.returncode)
            
    except Exception as e:
        print(f"Error running tests: {e}")
        sys.exit(1)

if __name__ == "__main__":
    run_tests()
