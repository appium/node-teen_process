#!/bin/bash

trap "trapped!" SIGHUP
$*
