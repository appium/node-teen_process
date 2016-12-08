#!/bin/bash

echo "foo"
sleep 1s
1>&2 echo "bar"
exit 1
