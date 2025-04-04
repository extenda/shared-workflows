# Sendout Values Action

## Usage 
Manually triggered action that fetches CCC (Customer Control Configurations)
values by sending a list of tenant identifiers to an internal endpoint.
As a result messages will be sent to the push endpoint in selfscan.
---

## Input Parameters

- `kind`: Specifies the type of data to fetch (e.g., "user_data", "payment_history").
- `tenants`: A list of tenant identifiers for which the CCC values are to be fetched.