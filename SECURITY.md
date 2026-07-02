# Security Policy

## Scope

This repository is a public reference implementation. It must not contain production secrets, private prompts, customer records, real call transcripts, provider keys, private infrastructure URLs, or live payment data.

## Supported versions

The `main` branch is the only supported branch for security fixes.

## Reporting a vulnerability

Please report security issues privately by email: hello@denisai.online.

Include:

- The affected file, function, or command.
- Steps to reproduce using synthetic data.
- The impact and a suggested fix, if known.

Do not open a public issue for vulnerabilities and do not include secrets or real customer data in any report.

## Safe contribution rules

- Use synthetic examples only.
- Redact logs before sharing them.
- Keep environment variables documented by name, never by value.
- Keep live side effects behind explicit dry-run or confirmation gates.
