# Security policy

We take the security of TgActor seriously. If you discover a vulnerability, please report it responsibly by following the instructions below.

## Supported versions

Security updates are applied to the active `main` branch.

| Version | Supported |
| ------- | --------- |
| main    | Yes       |
| < 3.0   | No        |

## Reporting a vulnerability

Do not report security vulnerabilities through public GitHub issues.

To report a vulnerability:

1. GitHub Security Advisory (Preferred):
   Open the **Security** tab of this repository on GitHub and select **Report a vulnerability** to start a private advisory.

2. Direct contact:
   If GitHub Private Vulnerability Reporting is unavailable, reach out directly to the maintainer on Telegram at [@ivanchikbyte](https://t.me/ivanchikbyte).

### What to include in your report

To help us triage and resolve the issue quickly, include the following details:

* Type of vulnerability (for example: session leakage, SQL injection, authentication bypass, unauthorized API access, insecure deserialization)
* Location of the affected code (file path and line numbers)
* Step-by-step instructions to reproduce the issue, including sample requests, scripts, or payloads
* Potential impact and threat scenarios
* Any proposed mitigations or code fixes

## Response timeline and process

1. Acknowledgment: We acknowledge receipt of vulnerability reports within 48 hours.
2. Assessment: We verify the report, assess the severity, and identify affected components.
3. Remediation: We build and test a patch in a private branch or security advisory draft.
4. Disclosure: After the patch is released and validated, we coordinate public disclosure and credit your contribution, unless you request anonymity.
