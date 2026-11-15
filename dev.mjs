import { spawn } from 'node:child_process'

const processes = [
    spawn('npm.cmd', ['run', 'dev'], { cwd: 'Frontend', stdio: 'inherit', shell: true }),
    spawn('npm.cmd', ['run', 'dev'], { cwd: 'backend', stdio: 'inherit', shell: true })
]

const stopProcesses = () => {
    for (const child of processes) {
        if (!child.killed) child.kill()
    }
}

process.on('SIGINT', () => {
    stopProcesses()
    process.exit(0)
})

process.on('SIGTERM', () => {
    stopProcesses()
    process.exit(0)
})

for (const child of processes) {
    child.on('exit', (code) => {
        if (code && code !== 0) {
            stopProcesses()
            process.exit(code)
        }
    })
}
