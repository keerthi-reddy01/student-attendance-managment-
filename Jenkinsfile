pipeline {
    agent any

    parameters {
        booleanParam(
            name: 'DEPLOY_K8S',
            defaultValue: false,
            description: 'Deploy the freshly built image to the local Kubernetes cluster and run a persistence check.'
        )
    }

    options {
        timestamps()
        timeout(time: 60, unit: 'MINUTES')
        buildDiscarder(logRotator(numToKeepStr: '20', artifactNumToKeepStr: '10'))
        disableConcurrentBuilds()
    }

    stages {
        stage('Toolchain') {
            steps {
                bat 'call scripts\\env.cmd && node --version && npm --version && docker version --format "{{.Server.Version}}"'
            }
        }

        stage('Install dependencies') {
            steps {
                bat 'call scripts\\env.cmd && npm ci'
            }
        }

        stage('API tests') {
            steps {
                bat 'call scripts\\env.cmd && if not exist reports mkdir reports && npm run test:junit'
            }
            post {
                always {
                    junit allowEmptyResults: true, testResults: 'reports/junit.xml'
                }
            }
        }

        stage('Docker image') {
            steps {
                bat 'call scripts\\env.cmd && docker build -t student-attendance:1.0.0 .'
            }
        }

        stage('Docker persistence smoke test') {
            steps {
                bat 'call scripts\\env.cmd && powershell -NoProfile -ExecutionPolicy Bypass -File scripts\\ci-docker-smoke.ps1'
            }
        }

        stage('Selenium E2E tests') {
            steps {
                bat 'call scripts\\env.cmd && powershell -NoProfile -ExecutionPolicy Bypass -File scripts\\ci-e2e.ps1'
            }
        }

        stage('Kubernetes deploy and persistence check') {
            when {
                expression { params.DEPLOY_K8S }
            }
            steps {
                bat 'call scripts\\env.cmd && powershell -NoProfile -ExecutionPolicy Bypass -File scripts\\ci-k8s.ps1'
            }
        }
    }

    post {
        always {
            junit allowEmptyResults: true, testResults: 'reports/junit.xml'
            archiveArtifacts artifacts: 'reports/junit.xml, reports/screenshots/**/*.png, reports/*.log', allowEmptyArchive: true
        }
        success {
            echo 'All validation stages passed. Screenshots and JUnit results are archived on this build.'
        }
        failure {
            echo 'A validation stage failed. Inspect the stage log, JUnit report and archived artifacts.'
        }
    }
}
