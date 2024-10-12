#!/bin/sh
eval $(dbus export clouddrive_)
source /koolshare/scripts/base.sh

if [ "$clouddrive_enable" == "1" ];then
	echo_date "先关闭CloudDrive插件！"
	sh /koolshare/scripts/clouddrive_config.sh stop
fi

find /koolshare/init.d/ -name "*clouddrive*" | xargs rm -rf
rm -rf /koolshare/bin/clouddrive 2>/dev/null
rm -rf /tmp/clouddrive 2>/dev/null
rm -rf /koolshare/res/icon-clouddrive.png 2>/dev/null
rm -rf /koolshare/scripts/clouddrive*.sh 2>/dev/null
rm -rf /koolshare/webs/Module_clouddrive.asp 2>/dev/null
rm -rf /koolshare/scripts/clouddrive_install.sh 2>/dev/null
rm -rf /koolshare/scripts/uninstall_clouddrive.sh 2>/dev/null
rm -rf /koolshare/clouddrive 2>/dev/null
rm -rf /tmp/upload/clouddrive* 2>/dev/null
rm -rf /tmp/cd2_run.log 2>/dev/null

dbus remove clouddrive_version
dbus remove softcenter_module_clouddrive_name
dbus remove softcenter_module_clouddrive_install
dbus remove softcenter_module_clouddrive_version
dbus remove softcenter_module_clouddrive_title
dbus remove softcenter_module_clouddrive_description