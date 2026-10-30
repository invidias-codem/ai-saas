param(
  [Parameter(Mandatory=$true)][string]$Title,
  [Parameter(Mandatory=$true)][ValidateSet('folder','read','write')][string]$Kind,
  [Parameter(Mandatory=$true)][ValidateSet('accept','cancel')][string]$Action,
  [string]$Folder,
  [Parameter(Mandatory=$true)][string]$Screenshot
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes, System.Windows.Forms, System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class QualificationWindow {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr handle);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
}
'@
$condition = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::NameProperty, $Title)
$deadline = [DateTime]::UtcNow.AddSeconds(25)
$window = $null
while ([DateTime]::UtcNow -lt $deadline) {
  $nativeWindows = @([System.Windows.Automation.AutomationElement]::RootElement.FindAll([System.Windows.Automation.TreeScope]::Children, $condition))
  if ($nativeWindows.Count -eq 1) { $window = $nativeWindows[0]; break }
  if ($nativeWindows.Count -gt 1) { throw 'Native dialog identity is ambiguous' }
  Start-Sleep -Milliseconds 200
}
if ($null -eq $window) { throw "Expected native dialog did not appear: $Title" }
$bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bitmap = [System.Drawing.Bitmap]::new($bounds.Width, $bounds.Height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
try {
  $graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
  $bitmap.Save($Screenshot, [System.Drawing.Imaging.ImageFormat]::Png)
} finally { $graphics.Dispose(); $bitmap.Dispose() }
$handle = [IntPtr]$window.Current.NativeWindowHandle
[void][QualificationWindow]::SetForegroundWindow($handle)
$window.SetFocus()
if ([QualificationWindow]::GetForegroundWindow() -ne $handle) { throw 'Refusing to type outside the expected native dialog' }
if ($Kind -eq 'folder' -and $Action -eq 'accept') {
  [System.Windows.Forms.SendKeys]::SendWait('^l')
  $escaped = [regex]::Replace($Folder, '[+^%~(){}\[\]]', { param($m) '{' + $m.Value + '}' })
  [System.Windows.Forms.SendKeys]::SendWait($escaped)
  [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
  Start-Sleep -Milliseconds 300
}
try {
  $buttons = $window.FindAll([System.Windows.Automation.TreeScope]::Descendants,
    [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Button))
  $names = if ($Action -eq 'cancel') { @('Cancel') } elseif ($Kind -eq 'folder') { @('Select Folder','Select','Open','Choose') } elseif ($Kind -eq 'read') { @('Allow read access','OK') } else { @('Allow reviewed changes','OK') }
  foreach ($name in $names) {
    $selected = @($buttons | Where-Object { $_.Current.Name -eq $name -and $_.Current.IsEnabled })
    if ($selected.Count -eq 1) {
      $pattern = $selected[0].GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
      $pattern.Invoke()
      exit 0
    }
  }
  throw 'Expected native consent button was not found'
} catch [System.Windows.Automation.ElementNotAvailableException] {
  if ($Kind -ne 'folder' -or $Action -ne 'accept') { throw }
  # Enter can complete native folder selection. The caller separately verifies the read-consent dialog.
}
