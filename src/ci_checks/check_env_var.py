import sys

env_examples = [x.split("=")[0] for x in open(".env.example").read().strip().split("\n")]
environment_d_ts = open("src/environment.d.ts").read()
for env_var in env_examples:
    if env_var not in environment_d_ts:
        print(f"Missing '{env_var}' in environment.d.ts")
        sys.exit(1)
    else:
        print(f"Found '{env_var}' in environment.d.ts")
sys.exit(0)
