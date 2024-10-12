#!/bin/sh

source /koolshare/scripts/base.sh
eval $(dbus export clouddrive_)
alias echo_date='echo 【$(TZ=UTC-8 date -R +%Y年%m月%d日\ %X)】:'
LOG_FILE=/tmp/upload/clouddrive_log.txt
CLOUDDRIVE_LOG_FILE=/tmp/upload/clouddrive.log
LOCK_FILE=/var/lock/clouddrive.lock
BASH=${0##*/}
ARGS=$@

set_lock(){
	exec 999>${LOCK_FILE}
	flock -n 999 || {
		# bring back to original log
		http_response "$ACTION"
		exit 1
	}
}

unset_lock(){
	flock -u 999
	rm -rf ${LOCK_FILE}
}

number_test(){
	case $1 in
		''|*[!0-9]*)
			echo 1
			;;
		*)
			echo 0
			;;
	esac
}

detect_running_status(){
	local BINNAME=$1
	local PID
	local i=40
	until [ -n "${PID}" ]; do
		usleep 250000
		i=$(($i - 1))
		PID=$(pidof ${BINNAME})
		if [ "$i" -lt 1 ]; then
			echo_date "🔴$1进程启动失败，请检查你的配置！"
			return
		fi
	done
	echo_date "🟢CloudDrive 启动成功，pid：${PID}"
}

check_status(){
	local clouddrive_PID=$(pidof clouddrive)
	if [ "${clouddrive_enable}" == "1" ]; then
		if [ -n "${clouddrive_PID}" ]; then
			if [ "${clouddrive_watchdog}" == "1" ]; then
				local clouddrive_time=$(perpls|grep clouddrive|grep -Eo "uptime.+-s\ " | awk -F" |:|/" '{print $3}')
				clouddrive_time="${clouddrive_time%s}"
				if [ -n "${clouddrive_time}" ]; then
					local ret="CloudDrive 进程运行正常！（PID：${clouddrive_PID} , 守护运行时间：$(formatTime $clouddrive_time)）"
				else
					local ret="CloudDrive 进程运行正常！（PID：${clouddrive_PID}）"
				fi
			else
				local ret="CloudDrive 进程运行正常！（PID：${clouddrive_PID}）"
			fi
		else
			local ret="CloudDrive 进程未运行！"
		fi
	else
		local ret="CloudDrive 插件未启用"
	fi
	http_response "$ret"
}

formatTime() {
	seconds=$1

	hours=$(( seconds / 3600 ))
	minutes=$(( (seconds % 3600) / 60 ))
	remainingSeconds=$(( seconds % 60 ))

	timeString=""

	if [ $hours -gt 0 ]; then
		timeString="${hours}时"
	fi

	if [ $minutes -gt 0 ] || [ $hours -gt 0 ]; then
		timeString="${timeString}${minutes}分"
	fi

	if [ $remainingSeconds -gt 0 ] || [ $minutes -gt 0 ] || [ $hours -gt 0 ]; then
		timeString="${timeString}${remainingSeconds}秒"
	fi

	echo "$timeString"
}

close_clouddrive_process(){
	clouddrive_process=$(pidof clouddrive)
	if [ -n "${clouddrive_process}" ]; then
		echo_date "⛔关闭CloudDrive进程..."
		if [ -f "/koolshare/perp/clouddrive/rc.main" ]; then
			perpctl d clouddrive >/dev/null 2>&1
		fi
		rm -rf /koolshare/perp/clouddrive
		kill -TERM "${clouddrive_process}" >/dev/null 2>&1
		sleep 2
		killall clouddrive >/dev/null 2>&1
		sleep 2
		kill -9 "${clouddrive_process}" >/dev/null 2>&1
		echo_date "⛔关闭CloudDrive成功"
	fi
}

start_clouddrive_process(){
	local cd2Log="/tmp/cd2_run.log"
	rm -rf ${CLOUDDRIVE_LOG_FILE}
	if [ "${clouddrive_watchdog}" == "1" ]; then
		echo_date "🟠启动 CloudDrive 进程，开启进程实时守护..."
		mkdir -p /koolshare/perp/clouddrive
		cat >/koolshare/perp/clouddrive/rc.main <<-EOF
			#!/bin/sh
			/koolshare/scripts/base.sh
			export CLOUDDRIVE_HOME=/koolshare/clouddrive
			CMD="/koolshare/clouddrive/clouddrive 1>$cd2Log  2>&1 &"
			if test \${1} = 'start' ; then
				exec >$cd2Log 2>&1
				exec \$CMD
			fi
			exit 0

		EOF
		chmod +x /koolshare/perp/clouddrive/rc.main
		chmod +t /koolshare/perp/clouddrive/
		sync
		perpctl A clouddrive >/dev/null 2>&1
		perpctl u clouddrive >/dev/null 2>&1
		detect_running_status clouddrive
	else
		echo_date "🟠启动 CloudDrive 进程..."
		rm -rf /tmp/clouddrive.pid
		export CLOUDDRIVE_HOME=/koolshare/clouddrive
		start-stop-daemon -S -q -b -m -p /tmp/var/clouddrive.pid -x /koolshare/clouddrive/clouddrive 1>$cd2Log  2>&1 &
		sleep 2
		detect_running_status clouddrive
	fi
}

close_clouddrive(){
	# 1. remove log
	rm -rf ${CLOUDDRIVE_LOG_FILE}

	# 2. stop 
	close_clouddrive_process
}

start_clouddrive(){
	# 1. stop first
	close_clouddrive_process

	# 2. start process
	start_clouddrive_process

}


case $1 in
start)
	if [ "${clouddrive_enable}" == "1" ]; then
		logger "[软件中心-开机自启]: CloudDrive开始自动启动！"
		start_clouddrive
	else
		logger "[软件中心-开机自启]: CloudDrive未开启，不自动启动！"
	fi
	;;
boot_up)
	if [ "${clouddrive_enable}" == "1" ]; then
		start_clouddrive
	fi
	;;
stop)
	close_clouddrive
	;;
esac

case $2 in
web_submit)
	set_lock
	true > ${LOG_FILE}
	http_response "$1"
	if [ "${clouddrive_enable}" == "1" ]; then
		echo_date "▶️开启CloudDrive！" | tee -a ${LOG_FILE}
		start_clouddrive | tee -a ${LOG_FILE}
	elif [ "${clouddrive_enable}" == "2" ]; then
		echo_date "🔁重启CloudDrive！" | tee -a ${LOG_FILE}
		dbus set clouddrive_enable=1
		start_clouddrive | tee -a ${LOG_FILE}
	else
		echo_date "ℹ️停止CloudDrive！" | tee -a ${LOG_FILE}
		close_clouddrive | tee -a ${LOG_FILE}
	fi
	echo DD01N05S | tee -a ${LOG_FILE}
	unset_lock
	;;
status)
	check_status
	;;

esac
