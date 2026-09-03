# Installe la tache planifiee "au logon" qui met a jour le depot Brainrot
# (git pull) a chaque ouverture de session. A LANCER UNE SEULE FOIS.
#
# Utilisation : clic droit sur ce fichier > "Executer avec PowerShell",
# ou dans une fenetre PowerShell :
#   powershell -NoProfile -ExecutionPolicy Bypass -File "<chemin>\install-logon-task.ps1"
#
# Ne necessite PAS les droits administrateur (tache au niveau utilisateur).

$pull = Join-Path $PSScriptRoot 'git-pull-on-logon.ps1'
$taskName = 'Brainrot - git pull au demarrage'
$arg = '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $pull + '"'

$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arg
$trigger = New-ScheduledTaskTrigger -AtLogOn
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'Pull du depot Brainrot au demarrage de session (garde-fou si modifs locales).' -Force

Write-Host ''
Write-Host ("OK - Tache installee : " + $taskName) -ForegroundColor Green
Write-Host 'Elle se lancera automatiquement a chaque ouverture de session.'
Write-Host 'Pour la retirer : Unregister-ScheduledTask -TaskName "Brainrot - git pull au demarrage" -Confirm:$false'
