# DevPulse Project Overview

## Document status

This document describes the current product direction. It distinguishes proposed
MVP scope from future ideas. Feature details are still subject to approval before
implementation.

## The problem

Engineering teams produce a large amount of operational information every day:
pull requests, reviews, commits, issues, CI runs, deployments, and incidents.
That information is usually spread across multiple tools and teams must assemble
the story manually.

Common problems include:

- It is difficult to see whether work is flowing or getting stuck.
- Review bottlenecks and stale pull requests are hard to spot early.
- Deployment activity and repository activity are not viewed together.
- Engineering managers spend time collecting status updates instead of acting on
  them.
- Existing dashboards often require broad access to source code, which may be
  unnecessary for operational reporting.

DevPulse aims to solve these problems by collecting operational metadata and
presenting useful, workspace-scoped insights in one place.

## Target users

The following user groups are proposed. Their exact priorities and permissions
must be confirmed before implementation.

| User group | Primary need |
| --- | --- |
| Engineering managers | Understand delivery flow, bottlenecks, and team workload |
| Tech leads | Track review activity, stale work, and repository health |
| Platform and DevOps engineers | See deployment and delivery signals together |
| Developers | Understand the state of their repositories and pull requests |
| Small engineering teams | Get useful delivery insights without a large internal tooling effort |

## Product principles

1. **Metadata first.** Collect the minimum metadata required for insights rather
   than storing source code, file contents, or diffs.
2. **Workspace isolation.** Every operational record belongs to a workspace and
   must only be visible to authorized members of that workspace.
3. **Useful over exhaustive.** Prefer a small number of clear, actionable
   insights over a large collection of raw data.
4. **Explainable.** Users should be able to understand what a metric means and
   where its underlying data came from.
5. **Least privilege.** Request only the integration permissions needed for the
   approved feature.

## Metadata-first GitHub integration

DevPulse plans to connect to GitHub and collect metadata such as:

- Repository identity, name, owner, visibility, and default branch
- Pull request number, title, state, author, timestamps, and review state
- Review submissions and their states
- Commit identifiers, authors, and timestamps
- Issue identifiers, titles, states, and timestamps
- Workflow run status and duration
- Deployment or release metadata supplied through an approved integration

DevPulse does **not** plan to clone repositories, store source files, store
diffs, or analyze code contents by default. Exact fields, retention periods, and
integration permissions remain open decisions.

## Proposed MVP features

These features are candidates for the first usable release. They are not
implemented and are not final requirements.

| Feature | Description |
| --- | --- |
| User authentication | Users sign in and access only the workspaces they belong to |
| Workspace management | Create a workspace and manage members and roles |
| GitHub connection | Connect a GitHub account or installation using least-privilege permissions |
| Repository metadata sync | Import repository, pull request, review, commit, and issue metadata |
| Background synchronization | Run imports and refreshes through the independent worker |
| Delivery dashboard | Show repository activity, review flow, and recent deployments |
| Basic insights | Highlight stale pull requests, review bottlenecks, and activity trends |
| Sync status | Show whether a workspace or repository is connected and up to date |

## Future enhancements

These ideas are not part of the approved MVP and must not be implemented without
a separate approved milestone.

- AI-generated summaries of repository and delivery activity
- Anomaly detection and delivery-risk forecasting
- Custom dashboards and saved reports
- Additional source-control providers such as GitLab and Bitbucket
- Chat notifications through Slack or Microsoft Teams
- Incident management and on-call integrations
- Single sign-on and advanced enterprise access controls
- Audit exports and compliance reporting
- Public API or embedded analytics
- Historical trend analysis over longer retention periods

## Proposed non-goals

Unless a future requirement changes them, DevPulse is not intended to:

- Host or mirror source code
- Replace GitHub, GitHub Actions, or an incident management system
- Provide a full project-management suite
- Perform code review or source-code analysis by default
- Collect personal data that is not required for the approved insights

## Open product decisions

- Which MVP features are required for the first release
- Whether GitHub integration uses a GitHub App, OAuth app, or both
- Which roles and permissions exist
- Which metrics and insights are considered essential
- How long metadata is retained
- Whether deployment data is ingested through webhooks, an API, or both
