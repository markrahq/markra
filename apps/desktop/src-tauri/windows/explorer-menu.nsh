!macro MarkraRegisterExplorerMenu OBJECT ARGUMENT
  WriteRegStr SHCTX "Software\Classes\${OBJECT}\shell\Markra.open" "" "Open with Markra"
  WriteRegStr SHCTX "Software\Classes\${OBJECT}\shell\Markra.open" "Icon" "$\"$INSTDIR\${MAINBINARYNAME}.exe$\",0"
  WriteRegStr SHCTX "Software\Classes\${OBJECT}\shell\Markra.open\command" "" "$\"$INSTDIR\${MAINBINARYNAME}.exe$\" $\"${ARGUMENT}$\""
!macroend

!macro MarkraUnregisterExplorerMenu OBJECT ARGUMENT
  ReadRegStr $R0 SHCTX "Software\Classes\${OBJECT}\shell\Markra.open\command" ""
  ; Preserve a verb that another installation may have replaced after this one was installed.
  ${If} $R0 == "$\"$INSTDIR\${MAINBINARYNAME}.exe$\" $\"${ARGUMENT}$\""
    DeleteRegKey SHCTX "Software\Classes\${OBJECT}\shell\Markra.open"
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; Markdown associations already provide their own Open with Markra verb.
  !insertmacro MarkraRegisterExplorerMenu "SystemFileAssociations\.txt" "%1"
  !insertmacro MarkraRegisterExplorerMenu "Directory" "%1"
  !insertmacro MarkraRegisterExplorerMenu "Directory\Background" "%V"
  ; Tell Explorer to refresh its cached file-association data.
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  !insertmacro MarkraUnregisterExplorerMenu "SystemFileAssociations\.txt" "%1"
  !insertmacro MarkraUnregisterExplorerMenu "Directory" "%1"
  !insertmacro MarkraUnregisterExplorerMenu "Directory\Background" "%V"
  ; Tell Explorer to refresh its cached file-association data.
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
