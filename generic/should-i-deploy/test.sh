#!/bin/bash

# Mocking inputs
TIME_ZONE="UTC"
WORK_HOURS_START="08:00"
WORK_HOURS_END="17:00"
COMMIT_MSG="regular commit"

# Test logic
check_deploy() {
    local current_time=$1
    local day_of_week=$2
    local commit_msg=$3

    if [[ "$commit_msg" == *"[force deploy]"* ]]; then
        echo "Force deploy detected. Proceeding..."
        return 0
    fi

    # 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday, 7=Sunday
    if [ "$day_of_week" -le 4 ]; then
        if [[ "$current_time" > "$WORK_HOURS_START" || "$current_time" == "$WORK_HOURS_START" ]] && \
           [[ "$current_time" < "$WORK_HOURS_END" || "$current_time" == "$WORK_HOURS_END" ]]; then
            echo "SUCCESS: It's a good day and time to deploy! ($day_of_week at $current_time)"
            return 0
        else
            echo "FAILURE: Deployment is only allowed during work hours ($WORK_HOURS_START - $WORK_HOURS_END). Current time is $current_time."
            return 1
        fi
    else
        echo "FAILURE: Deployment is only allowed Monday to Thursday. Today is day $day_of_week."
        return 1
    fi
}

echo "Running tests..."

# Test Case 1: Monday within work hours
check_deploy "10:00" 1 "regular commit" || exit 1

# Test Case 2: Monday before work hours
check_deploy "07:59" 1 "regular commit" && exit 1

# Test Case 3: Monday after work hours
check_deploy "17:01" 1 "regular commit" && exit 1

# Test Case 4: Friday (any time)
check_deploy "10:00" 5 "regular commit" && exit 1

# Test Case 5: Friday with force deploy
check_deploy "10:00" 5 "[force deploy] bypass" || exit 1

# Test Case 6: Edge case - exactly start time
check_deploy "08:00" 1 "regular commit" || exit 1

# Test Case 7: Edge case - exactly end time
check_deploy "17:00" 1 "regular commit" || exit 1

# Test Case 8: commit message containing shell metacharacters. Quotes and parentheses
# are ordinary text in a commit body and must not affect the decision.
check_deploy "10:00" 1 'fix: report bcprov "(version managed from 1.80)" in the tree' || exit 1

# Test Case 9: force deploy still detected when the message carries metacharacters, and
# no substitution is performed on it.
canary="${TMPDIR:-/tmp}/should-i-deploy-canary.$$"
rm -f "$canary"
check_deploy "10:00" 5 '[force deploy] $(touch '"$canary"') and `touch '"$canary"'`' || exit 1
if [ -e "$canary" ]; then
    echo "FAILURE: commit message was evaluated by the shell"
    rm -f "$canary"
    exit 1
fi
echo "SUCCESS: commit message treated as data, not code"

# Test Case 10: guard the actual defect. The bash above can only prove the logic is safe
# once the message arrives as data; the real bug was that ${{ }} substitution pasted the
# commit message straight into the generated shell source. Assert the run block contains
# no expressions at all, so every value has to come in through `env:`.
action_yaml="$(dirname "$0")/action.yaml"
run_block=$(awk '/^      run: \|$/ {flag=1; next} flag' "$action_yaml")
if [ -z "$run_block" ]; then
    echo "FAILURE: could not locate the run block in $action_yaml"
    exit 1
fi
if grep -q '\${{' <<<"$run_block"; then
    echo "FAILURE: action.yaml interpolates an expression inside the run block:"
    grep -n '\${{' <<<"$run_block"
    exit 1
fi
echo "SUCCESS: run block contains no expression interpolation"

echo "All tests passed!"
