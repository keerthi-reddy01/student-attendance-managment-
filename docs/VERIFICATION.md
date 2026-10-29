# Verification Report

**Project:** AttendX — Student Attendance Management System  
**Date:** 29 October 2026  
**Status:** PASS — all application, Docker, Jenkins, Selenium and Kubernetes checks completed.

This report records the final verification run for the local demonstration environment. Credentials and generated logs remain outside version control.

## 1. Environment

| Component | Version / detail |
| --- | --- |
| Operating system | Windows (workstation) |
| Node.js | v24.22.1 |
| npm | 11.19.1 |
| Docker Engine | 29.9.2 |
| Jenkins | 2.580.2 LTS (portable WAR, Temurin JDK 21) |
| Minikube | v1.39.0 (Docker driver) |
| Kubernetes server | v1.37.0 |
| kubectl client | v1.36.1 |
| Browser | Google Chrome, headless mode |

Ports used: application `3000`, Docker smoke test `3100`, isolated Selenium run `3200`, Jenkins `8080`, Kubernetes port-forward `8081`, Kubernetes NodePort `30080`.

## 2. Application and database

| Check | Command | Result |
| --- | --- | --- |
| API and integration tests | `npm test` | **14/14 passed** in ~0.97 s |
| Read-only live verification | `npm run verify` | **9/9 checks passed** against `http://127.0.0.1:3000` |
| Health endpoint | `GET /api/health` | `status=ok`, `database=true`, version `1.0.0` |
| Students | `GET /api/students` | 12 students, `CS001`–`CS012` |
| Threshold | `GET /api/settings` | 75% |
| Current month | `GET /api/dashboard` | 21 working days, 147 periods, class attendance 80.3% |
| Low attendance | `GET /api/dashboard` | 4 students below 75% |
| Stored attendance | SQLite direct read | **3,612 rows across 43 distinct dates** (`2026-09-01` to `2026-10-29`) |
| Demo data | SQLite direct read | 12 students, no E2E/K8s smoke-test students |

The live verifier covered health, dashboard, settings, student list, monthly report, student drill-down, daily history, CSV export and frontend serving.

## 3. Selenium browser tests

| Check | Result |
| --- | --- |
| `npm run test:e2e` (isolated app on port 3200) | **7/7 passed** |
| Dashboard and navigation | PASS |
| Add student through modal | PASS |
| Seven-period attendance, correction and reload persistence | PASS |
| Monthly report, drill-down and CSV export | PASS |
| Daily history filtering | PASS |
| Settings persistence | PASS |
| Mobile navigation and layout | PASS |

Screenshots are stored in [`docs/screenshots/`](screenshots/). The E2E suite runs against a disposable database on port 3200; `99-final-state.png` was recaptured from the clean local demo database (12 students).

## 4. Docker

| Check | Result |
| --- | --- |
| `docker build -t student-attendance:1.0.0 .` | PASS |
| Image size | 258 MB |
| Runtime user | `uid=1000(node) gid=1000(node)` — non-root |
| Container health check | PASS (`/api/health`) |
| Docker persistence smoke test | PASS — student record survived container restart through the named volume |
| Docker Compose | Build, start and health verified in the prior validation run; stack stopped afterward |

The smoke test uses disposable container `attendance-ci-smoke` and volume, then removes both. It validates health, frontend serving, API writes and SQLite volume persistence.

## 5. Jenkins

| Check | Result |
| --- | --- |
| Portable installation | PASS — `C:\devops\jenkins`, bundled JDK 21, no administrator rights |
| Plugins | workflow-aggregator, git, junit, timestamper, pipeline-stage-view, ansicolor |
| Job | `Attendance-Pipeline`, SCM `file:///C:/devops/student%20attendance%20managment` |
| Authentication | PASS — `admin` account via `HudsonPrivateSecurityRealm` |
| Authorization | PASS — `FullControlOnceLoggedInAuthorizationStrategy`, anonymous read disabled |
| Anonymous job API | **HTTP 403** |
| Authenticated job/build API | **HTTP 200** |
| JUnit report | **14 tests, 0 failures, 0 skipped** |
| Final build | **#7 — SUCCESS**, 61.7 s, `DEPLOY_K8S=true`, checked out from GitHub |
| Build #7 commit | `f4bda9b3373bddff4b4f1ddd405205ee49b04481` |
| Previous build | **#6 — SUCCESS**, 60.9 s, commit `a54119c` |

Build #7 executed every pipeline stage:

1. Toolchain — Node v24.22.1, npm 11.19.1, Docker server 29.9.2.
2. Install dependencies — `npm ci`, 101 packages, 0 vulnerabilities.
3. API tests — 14 tests published as JUnit.
4. Docker image — `student-attendance:1.0.0` built successfully.
5. Docker persistence smoke test — PASS, including restart.
6. Selenium E2E — 7/7 passed.
7. Kubernetes deploy and persistence check — PASS.
8. Post actions — JUnit, screenshots and logs archived.

Build URL: <http://localhost:8080/job/Attendance-Pipeline/7/>  
Local console log: `reports/jenkins-build-7.log` (generated, gitignored).

## 6. Kubernetes

| Check | Result |
| --- | --- |
| Minikube | Running (control plane, kubelet, API server, kubeconfig configured) |
| Namespace | `attendance` |
| Deployment | `attendance-app`, 1 replica, image `student-attendance:1.0.0` |
| Pod | Running, readiness and liveness probes passing |
| Service | `attendance-service`, ClusterIP, NodePort **30080** → port 80 → container 3000 |
| PVC | `attendance-data`, **Bound**, 1 GiB, `ReadWriteOnce` |
| Security context | `runAsUser=1000`, `runAsGroup=1000`, `fsGroup=1000`, privilege escalation disabled |
| Health through service | `status=ok`, `environment=production`, `database=true` |
| Persistence | Pod deleted and rescheduled; smoke-test student remained available through the PVC |
| Cleanup | Smoke-test student removed; service reports 12 students and threshold 75 |
| Deployment availability | `Available=True` after the reschedule |

Access from the host:

```bat
kubectl -n attendance port-forward svc/attendance-service 8081:80
```

Then open <http://localhost:8081>.

## 7. GitHub

| Check | Result |
| --- | --- |
| Account | `keerthi-reddy01` (authenticated with Git Credential Manager) |
| Repository | <https://github.com/keerthi-reddy01/student-attendance-managment-> |
| Visibility | Public |
| Branch | `main` |
| Remote | `origin` → `https://github.com/keerthi-reddy01/student-attendance-managment-.git` |
| Pushed HEAD | `f4bda9b` — full commit history and documentation |
| Jenkins SCM | Job `Attendance-Pipeline` now checks out the GitHub repository |

## 8. Reproduce the verification

```bat
cd /d "C:\devops\student attendance managment"

npm ci
npm test
npm run verify

scripts\run-docker-smoke.cmd
scripts\run-e2e.cmd -SeedDemo

scripts\start-jenkins.cmd
scripts\trigger-jenkins.cmd -DeployK8s

kubectl -n attendance get pods,svc,pvc
kubectl -n attendance rollout status deployment/attendance-app
```

## 9. Known limitations

- Jenkins credentials are stored in `C:\devops\jenkins\credentials.txt` for local demonstration. Use a secret manager and HTTPS in any shared environment.
- SQLite with a single replica and a `ReadWriteOnce` volume is appropriate for this teaching project, not for horizontally scaled production use.
- On Windows with the Minikube Docker driver, NodePort 30080 is reachable inside the cluster network; use `kubectl port-forward` or `minikube service` from the host.
- The application has no user authentication or role-based access control; these are listed as production hardening items in the README.
