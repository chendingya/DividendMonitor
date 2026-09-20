import { existsSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { homedir } from 'node:os'
import { spawn, spawnSync } from 'node:child_process'

const workspace = resolve(import.meta.dirname, '..')
const managedJavaRoot = join(workspace, '.runtime-data', 'tools', 'jdk21')
const managedJava = existsSync(managedJavaRoot)
  ? readdirSync(managedJavaRoot).map((name) => join(managedJavaRoot, name)).find((path) => existsSync(join(path, 'bin', process.platform === 'win32' ? 'java.exe' : 'java')))
  : undefined
const javaHome = process.env.ANDROID_JAVA_HOME || managedJava || process.env.JAVA_HOME
const sdkHome = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT ||
  (process.platform === 'win32' ? join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'Android', 'Sdk') : join(homedir(), 'Android', 'Sdk'))

if (!javaHome) throw new Error('Android 构建需要 JDK 21，请设置 ANDROID_JAVA_HOME 或 JAVA_HOME')
if (!existsSync(sdkHome)) throw new Error('找不到 Android SDK，请设置 ANDROID_HOME')
const java = spawnSync(join(javaHome, 'bin', process.platform === 'win32' ? 'java.exe' : 'java'), ['-version'], { encoding: 'utf8', windowsHide: true })
const javaVersion = /version "(\d+)/.exec(`${java.stdout ?? ''}${java.stderr ?? ''}`)
if (java.status !== 0 || !javaVersion || Number(javaVersion[1]) < 21) throw new Error('Capacitor Android 需要 JDK 21 或更高版本，请检查 ANDROID_JAVA_HOME')
if (!existsSync(join(sdkHome, 'platforms', 'android-35', 'android.jar'))) throw new Error('Android SDK Platform 35 不完整，请通过 SDK Manager 安装 platforms;android-35')

const tasks = process.argv.slice(2)
if (tasks.length === 0) tasks.push(':app:assembleDebug')
if (tasks.some((task) => !/^:?[A-Za-z][A-Za-z0-9:]*$/.test(task))) throw new Error('仅接受 Gradle 任务名称')

writeFileSync(join(workspace, 'android', 'local.properties'), `sdk.dir=${sdkHome.replaceAll('\\', '/')}\n`)
const windows = process.platform === 'win32'
const child = spawn(windows ? 'cmd.exe' : './gradlew', windows
  ? ['/d', '/c', `gradlew.bat ${tasks.join(' ')} --no-daemon --console=plain`]
  : [...tasks, '--no-daemon', '--console=plain'], {
  cwd: join(workspace, 'android'),
  env: { ...process.env, JAVA_HOME: javaHome, ANDROID_HOME: sdkHome },
  stdio: 'inherit', windowsHide: true
})
child.on('error', (error) => { console.error(error); process.exitCode = 1 })
child.on('exit', (code) => { process.exitCode = code ?? 1 })
