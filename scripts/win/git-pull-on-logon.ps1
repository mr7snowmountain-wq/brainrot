# Brainrot - pull au demarrage de session (Etape 2.d du plan).
#
# Recupere automatiquement depuis GitHub ce que le robot a produit/publie
# (fichiers de veille, articles), sans aucune action manuelle.
#
# GARDE-FOU : si des modifications locales NON commitees existent, on
# n'execute PAS le pull (evite un conflit de rebase). Le pull se fera alors
# a la main. La tache ne bloque jamais l'ouverture de session.
#
# Installe comme tache planifiee "au logon". Log : .git\logon-pull.log

# Racine du depot = deux niveaux au-dessus de ce script (scripts/win/..)
$repo = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent

# git.exe (chemin complet d'abord, repli sur le PATH)
$git = 'C:\Program Files\Git\cmd\git.exe'
if (-not (Test-Path $git)) { $git = 'git' }

$log = Join-Path $repo '.git\logon-pull.log'
function Write-Log($m) { "$(Get-Date -Format s)  $m" | Out-File -FilePath $log -Append -Encoding utf8 }

try {
  Set-Location $repo
  $dirty = & $git status --porcelain
  if ($dirty) {
    Write-Log 'SKIP: modifications locales non commitees, pull manuel requis'
    exit 0
  }
  $out = & $git pull --rebase 2>&1
  Write-Log ('PULL: ' + ($out -join ' | '))
} catch {
  Write-Log ('ERREUR: ' + $_.Exception.Message)
  exit 0
}
