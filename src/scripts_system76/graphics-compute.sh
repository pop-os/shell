#!/bin/sh
#
# name: Switch to Compute Graphics
# icon: preferences-system-symbolic
# description: Use integrated GPU for display; discrete for CUDA / OpenCL
# keywords: compute graphics switch nvidia

gnome-terminal -- sh -c '
    if system76-power graphics compute; then
        echo "Succesfully switched. You may now reboot"
    else
        echo "Failed to switch\nPress key to exit"
    fi
    
    read x  
'