@echo off
trap "trapped!" SIGTERM
%*
