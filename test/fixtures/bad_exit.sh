#!/bin/bash

echo "foo"
sleep 1
1>&2 echo "bar"
exit 1
