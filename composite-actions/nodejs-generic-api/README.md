# Instructions

This is recommended step by step instruction, to use this composite actions.
- First you should run [test-unit](test-unit) and [test-opa](test-opa) in parallel,
because this two actions, do not depend on any other action.
- After all tests, you should run [staging-deploy](staging-deploy). This run
should depend on [test-unit](test-unit) and [test-opa](test-opa).
- After deploy to staging, you should run [prod-deploy](prod-deploy).
This run should depend on [staging-deploy](staging-deploy).
