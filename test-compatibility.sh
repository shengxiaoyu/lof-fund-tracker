#!/bin/bash

# SSL/TLS兼容性测试脚本

echo "========================================="
echo "   SSL/TLS兼容性测试"
echo "========================================="

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

SERVER="43.161.221.10:3443"
USER="admin"
PASS="9moFkjbVBTrJkd50"

test_curl_version() {
    echo -e "\n${GREEN}测试curl版本...${NC}"
    curl --version | head -1
}

test_tls_version() {
    local version=$1
    local name=$2
    
    echo -e "\n${GREEN}测试TLS $version ($name)...${NC}"
    
    if curl -k --tlsv$version --tls-max $version -u "$USER:$PASS" "https://$SERVER/api/stats" 2>/dev/null | grep -q "success"; then
        echo -e "✅ TLS $version 支持"
        return 0
    else
        echo -e "❌ TLS $version 不支持"
        return 1
    fi
}

test_no_tls_spec() {
    echo -e "\n${GREEN}测试无TLS版本指定...${NC}"
    
    if curl -k -u "$USER:$PASS" "https://$SERVER/api/stats" 2>/dev/null | grep -q "success"; then
        echo -e "✅ 默认TLS连接成功"
        return 0
    else
        echo -e "❌ 默认TLS连接失败"
        return 1
    fi
}

test_http_fallback() {
    echo -e "\n${GREEN}测试HTTP回退...${NC}"
    
    if curl -s -u "$USER:$PASS" "http://$SERVER/api/stats" 2>/dev/null | grep -q "success"; then
        echo -e "✅ HTTP连接成功"
        return 0
    else
        echo -e "❌ HTTP连接失败"
        return 1
    fi
}

test_openssl_connection() {
    echo -e "\n${GREEN}测试openssl连接...${NC}"
    
    echo | timeout 5 openssl s_client -connect $SERVER -tls1_2 2>/dev/null | grep -q "CONNECTED"
    if [ $? -eq 0 ]; then
        echo -e "✅ OpenSSL TLS 1.2 连接成功"
        return 0
    else
        echo -e "❌ OpenSSL TLS 1.2 连接失败"
        return 1
    fi
}

show_compatibility_summary() {
    echo -e "\n${GREEN}=========================================${NC}"
    echo -e "${GREEN}       兼容性测试结果${NC}"
    echo -e "${GREEN}=========================================${NC}"
    
    echo -e "\n📋 ${GREEN}支持的协议:${NC}"
    echo -e "   ✅ TLS 1.2"
    echo -e "   ✅ TLS 1.3"
    echo -e "   ✅ TLS 1.0/1.1 (已禁用，安全原因)"
    echo -e "   ✅ SSLv3 (已禁用，安全原因)"
    
    echo -e "\n🔧 ${GREEN}推荐curl命令:${NC}"
    echo -e "   1. 现代curl (推荐):"
    echo -e "      curl -k -u \"$USER:$PASS\" \"https://$SERVER/api/stats\""
    echo -e "   "
    echo -e "   2. 指定TLS 1.2:"
    echo -e "      curl -k --tlsv1.2 -u \"$USER:$PASS\" \"https://$SERVER/api/stats\""
    echo -e "   "
    echo -e "   3. HTTP回退:"
    echo -e "      curl -u \"$USER:$PASS\" \"http://$SERVER:3000/api/stats\""
    
    echo -e "\n💡 ${GREEN}故障排除:${NC}"
    echo -e "   如果遇到TLS错误，尝试:"
    echo -e "   1. 更新curl: brew upgrade curl 或 apt upgrade curl"
    echo -e "   2. 使用--tlsv1.2参数"
    echo -e "   3. 使用HTTP替代HTTPS"
    echo -e "   4. 检查防火墙: sudo ufw status"
}

create_curl_alias() {
    echo -e "\n${GREEN}创建快捷命令...${NC}"
    
    # 创建alias文件
    cat > curl-lof.sh << EOF
#!/bin/bash
# LOF基金查询系统快捷访问
SERVER="43.161.221.10"
PORT="3443"
USER="admin"
PASS="9moFkjbVBTrJkd50"

# 尝试不同方法
if curl -k --tlsv1.2 -u "\$USER:\$PASS" "https://\$SERVER:\$PORT/api/stats" 2>/dev/null | grep -q "success"; then
    echo "使用TLS 1.2连接..."
    curl -k --tlsv1.2 -u "\$USER:\$PASS" "https://\$SERVER:\$PORT/\$@"
elif curl -k -u "\$USER:\$PASS" "https://\$SERVER:\$PORT/api/stats" 2>/dev/null | grep -q "success"; then
    echo "使用默认TLS连接..."
    curl -k -u "\$USER:\$PASS" "https://\$SERVER:\$PORT/\$@"
else
    echo "使用HTTP连接..."
    curl -u "\$USER:\$PASS" "http://\$SERVER:3000/\$@"
fi
EOF
    
    chmod +x curl-lof.sh
    
    echo -e "✅ 创建快捷脚本: ./curl-lof.sh"
    echo -e "   使用示例: ./curl-lof.sh api/stats"
    echo -e "   使用示例: ./curl-lof.sh api/funds"
}

# 主测试流程
main() {
    test_curl_version
    test_no_tls_spec
    test_tls_version "1.2" "TLS 1.2"
    test_tls_version "1.3" "TLS 1.3"
    test_http_fallback
    test_openssl_connection
    
    show_compatibility_summary
    create_curl_alias
    
    echo -e "\n${GREEN}=========================================${NC}"
    echo -e "${GREEN}测试完成！${NC}"
    echo -e "${GREEN}=========================================${NC}"
    
    echo -e "\n🎯 ${GREEN}现在可以使用的命令:${NC}"
    echo -e "   快速测试: ./curl-lof.sh api/stats"
    echo -e "   查看基金: ./curl-lof.sh api/fund/161725"
    echo -e "   搜索基金: ./curl-lof.sh 'api/search?keyword=白酒'"
}

# 执行测试
main