# Installe la tache planifiee "au logon" qui met a jour le depot Brainrot
# (git pull) a chaque ouverture de session. A LANCER UNE SEULE FOIS.
#
# La fenetre reste ouverte a la fin (appuie sur Entree pour fermer).
# En cas d'erreur, le detail est aussi ecrit dans install-task.log (meme dossier).

$log = Join-Path $PSScriptRoot 'install-task.log'
function Say([string]$m, [string]$c = 'White') {
  Write-Host $m -ForegroundColor $c
  "$(Get-Date -Format s)  $m" | Out-File -FilePath $log -Append -Encoding utf8
}

$pull = Join-Path $PSScriptRoot 'git-pull-on-logon.ps1'
$taskName = 'Brainrot - git pull au demarrage'
$arg = '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $pull + '"'

Say "Installation de la tache : $taskName" 'Cyan'
Say "Utilisateur : $env:USERNAME"

try {
  $action    = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arg
  $trigger   = New-ScheduledTaskTrigger -AtLogOn
  $principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
  $settings  = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'Pull du depot Brainrot au demarrage de session.' -Force -ErrorAction Stop | Out-Null
  Say ""
  Say "OK - Tache installee avec succes." 'Green'
  Say "Elle se lancera a chaque ouverture de session."
}
catch {
  Say ""
  Say ("ECHEC : " + $_.Exception.Message) 'Red'
  Say "Piste : ferme cette fenetre, puis relance en tant qu'ADMINISTRATEUR :" 'Yellow'
  Say "  - Menu Demarrer > tape 'PowerShell'" 'Yellow'
  Say "  - Clic droit > 'Executer en tant qu'administrateur'" 'Yellow'
  Say "  - colle :  & '$PSCommandPath'" 'Yellow'
}

Write-Host ""
Read-Host "Appuie sur Entree pour fermer cette fenetre"
