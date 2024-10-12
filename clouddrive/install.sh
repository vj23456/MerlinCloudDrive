#!/bin/sh
source /koolshare/scripts/base.sh
alias echo_date='echo 【$(TZ=UTC-8 date -R +%Y年%m月%d日\ %X)】:'
MODEL=
FW_TYPE_CODE=
FW_TYPE_NAME=
DIR=$(cd $(dirname $0); pwd)
module=${DIR##*/}

get_model(){
	local ODMPID=$(nvram get odmpid)
	local PRODUCTID=$(nvram get productid)
	if [ -n "${ODMPID}" ];then
		MODEL="${ODMPID}"
	else
		MODEL="${PRODUCTID}"
	fi
}

get_fw_type() {
	local KS_TAG=$(nvram get extendno|grep -Eo "kool.+")
	if [ -d "/koolshare" ];then
		if [ -n "${KS_TAG}" ];then
			FW_TYPE_CODE="2"
			FW_TYPE_NAME="${KS_TAG}官改固件"
		else
			FW_TYPE_CODE="4"
			FW_TYPE_NAME="koolshare梅林改版固件"
		fi
	else
		if [ "$(uname -o|grep Merlin)" ];then
			FW_TYPE_CODE="3"
			FW_TYPE_NAME="梅林原版固件"
		else
			FW_TYPE_CODE="1"
			FW_TYPE_NAME="华硕官方固件"
		fi
	fi
}

platform_test(){
	local LINUX_VER=$(uname -r|awk -F"." '{print $1$2}')
	local ARCH=$(uname -m)
	if [ -d "/koolshare" -a -f "/usr/bin/skipd" -a "${LINUX_VER}" -ge "41" ];then
		echo_date 机型："${MODEL} ${FW_TYPE_NAME} 符合安装要求，开始安装插件！"
	else
		exit_install 1
	fi
}

set_skin(){
	local UI_TYPE=ASUSWRT
	local SC_SKIN=$(nvram get sc_skin)
	local ROG_FLAG=$(grep -o "680516" /www/form_style.css|head -n1)
	local TUF_FLAG=$(grep -o "D0982C" /www/form_style.css|head -n1)
	if [ -n "${ROG_FLAG}" ];then
		UI_TYPE="ROG"
	fi
	if [ -n "${TUF_FLAG}" ];then
		UI_TYPE="TUF"
	fi
	
	if [ -z "${SC_SKIN}" -o "${SC_SKIN}" != "${UI_TYPE}" ];then
		echo_date "安装${UI_TYPE}皮肤！"
		nvram set sc_skin="${UI_TYPE}"
		nvram commit
	fi
}

exit_install(){
	local state=$1
	case $state in
		1)
			echo_date "本插件适用于【koolshare 梅林改/官改 hnd/axhnd/axhnd.675x】固件平台！"
			echo_date "你的固件平台不能安装！！!"
			echo_date "本插件支持机型/平台：https://github.com/koolshare/rogsoft#rogsoft"
			echo_date "退出安装！"
			rm -rf /tmp/clouddrive* >/dev/null 2>&1
			exit 1
			;;
		0|*)
			rm -rf /tmp/clouddrive* >/dev/null 2>&1
			exit 0
			;;
	esac
}

dbus_nset(){
	# set key when value not exist
	local ret=$(dbus get $1)
	if [ -z "${ret}" ];then
		dbus set $1=$2
	fi
}

install_now() {
	# default value
	local TITLE="CloudDrive2"
	local DESCR="一个强大的多云盘管理工具，为用户提供包含云盘本地挂载的一站式的多云盘解决方案"
	local PLVER=$(cat ${DIR}/version)

	# delete crontabs job first
	if [ -n "$(cru l | grep clouddrive_watchdog)" ]; then
		echo_date "删除CloudDrive看门狗任务..."
		cru d clouddrive_watchdog 2>&1
	fi

	# stop ddns-go
	local clouddrive_enable=$(dbus get clouddrive_enable)
	local clouddrive_process=$(pidof clouddrive)
	local clouddrive_install=$(dbus get softcenter_module_clouddrive_install)
	if [ "$clouddrive_enable" == "1" -o -n "${clouddrive_process}" ];then
		echo_date "先关闭CloudDrive插件！以保证更新成功！"
		sh /koolshare/scripts/clouddrive_config.sh stop
	fi

	# create ddns-go config dirctory
	mkdir -p /koolshare/clouddrive
	mkdir -p /koolshare/clouddrive/wwwroot
	
	# remove some files first, old file should be removed, too
	find /koolshare/init.d/ -name "*clouddrive*" | xargs rm -rf
	rm -rf /koolshare/scripts/clouddrive*.sh 2>/dev/null
	rm -rf /koolshare/scripts/*clouddrive.sh 2>/dev/null
	rm -rf /koolshare/bin/clouddrive 2>/dev/null
	rm -rf /koolshare/clouddrive/wwwroot/* 2>/dev/null

	# isntall file
	echo_date "安装插件相关文件..."
	cp -rf /tmp/${module}/bin/clouddrive /koolshare/clouddrive/
	cp -rf /tmp/${module}/wwwroot/* /koolshare/clouddrive/wwwroot/
	cp -rf /tmp/${module}/res/* /koolshare/res/
	cp -rf /tmp/${module}/scripts/* /koolshare/scripts/
	cp -rf /tmp/${module}/webs/* /koolshare/webs/
	cp -rf /tmp/${module}/uninstall.sh /koolshare/scripts/uninstall_${module}.sh
	
	#创建开机自启任务
	[ ! -L "/koolshare/init.d/S200clouddrive.sh" ] && ln -sf /koolshare/scripts/clouddrive_config.sh /koolshare/init.d/S200clouddrive.sh
	[ ! -L "/koolshare/bin/clouddrive" ] && ln -sf /koolshare/clouddrive/clouddrive /koolshare/bin/clouddrive
	# Permissions
	chmod +x /koolshare/clouddrive* >/dev/null 2>&1
	chmod +x /koolshare/scripts/clouddrive* >/dev/null 2>&1
	chmod +x /koolshare/scripts/*clouddrive.sh >/dev/null 2>&1
	chmod +x /koolshare/bin/clouddrive >/dev/null 2>&1

	# dbus value
	echo_date "设置插件默认参数..."
	dbus set clouddrive_version="${PLVER}"
	dbus set clouddrive_binary="0.17.2"
	dbus set softcenter_module_clouddrive_version="${PLVER}"
	dbus set softcenter_module_clouddrive_install="1"
	dbus set softcenter_module_clouddrive_name="${module}"
	dbus set softcenter_module_clouddrive_title="${TITLE}"
	dbus set softcenter_module_clouddrive_description="${DESCR}"

	# 检查插件默认dbus值
	dbus_nset clouddrive_watchdog "0"
	dbus_nset clouddrive_enable "0"

	# re_enable
	if [ "${clouddrive_enable}" == "1" ];then
		echo_date "重新启动CloudDrive插件！"
		sh /koolshare/scripts/clouddrive_config.sh boot_up
	fi

	# finish
	echo_date "${TITLE}插件安装完毕！"
	exit_install
}

install() {
  get_model
  get_fw_type
  platform_test
  install_now
}

install
