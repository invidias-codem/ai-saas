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
using System.Text;
using System.Collections.Generic;
public static class QualificationWindow {
  public delegate bool EnumWindowCallback(IntPtr handle, IntPtr data);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowCallback callback, IntPtr data);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr handle, StringBuilder text, int size);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr handle);
  public static IntPtr[] FindVisible(string title) {
    var matches = new List<IntPtr>();
    EnumWindows((handle, data) => {
      var text = new StringBuilder(1024);
      GetWindowText(handle, text, text.Capacity);
      if (IsWindowVisible(handle) && text.ToString() == title) matches.Add(handle);
      return true;
    }, IntPtr.Zero);
    return matches.ToArray();
  }
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr handle);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
}
'@
function Save-DesktopEvidence {
  $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
  $bitmap = [System.Drawing.Bitmap]::new($bounds.Width, $bounds.Height)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  try {
    $graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
    $bitmap.Save($Screenshot, [System.Drawing.Imaging.ImageFormat]::Png)
  } finally { $graphics.Dispose(); $bitmap.Dispose() }
  $roots = [System.Windows.Automation.AutomationElement]::RootElement.FindAll(
    [System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)
  @($roots | ForEach-Object { @{name=$_.Current.Name; processId=$_.Current.ProcessId;
    handle=$_.Current.NativeWindowHandle; controlType=$_.Current.ControlType.ProgrammaticName} }) |
    ConvertTo-Json -Depth 3 | Set-Content -LiteralPath "$Screenshot.windows.json" -Encoding UTF8
}
$deadline = [DateTime]::UtcNow.AddSeconds(25)
$window = $null
while ([DateTime]::UtcNow -lt $deadline) {
  # The common file dialog can expose a UIA name different from its WM title.
  # Resolve the exact visible Win32 title first, then operate its UIA controls.
  $handles = @([QualificationWindow]::FindVisible($Title))
  if ($handles.Count -eq 1) {
    $window = [System.Windows.Automation.AutomationElement]::FromHandle($handles[0]); break
  }
  if ($handles.Count -gt 1) { throw 'Native dialog identity is ambiguous' }
  Start-Sleep -Milliseconds 200
}
Save-DesktopEvidence
if ($null -eq $window) { throw "Expected native dialog did not appear: $Title" }
$handle = [IntPtr]$window.Current.NativeWindowHandle
[void][QualificationWindow]::SetForegroundWindow($handle)
if ($window.Current.IsKeyboardFocusable) { $window.SetFocus() }
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

