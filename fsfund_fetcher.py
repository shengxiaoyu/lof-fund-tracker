#!/usr/bin/env python3
"""
华宝基金官网数据获取
"""

import requests
import re
import json
import sys
from datetime import datetime

def get_fsfund_data(fund_code):
    """获取华宝官网基金数据"""
    try:
        url = f"https://www.fsfund.com/fund/{fund_code}/fundDetail.shtml"
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
        
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()
        
        html = response.text
        
        # 提取单位净值
        net_value_match = re.search(r'class="ared">([0-9.]+)</strong>', html)
        net_value = net_value_match.group(1) if net_value_match else None
        
        # 提取净值日期
        date_match = re.search(r'单位净值\(([0-9-]+)\)</dt>', html)
        date = date_match.group(1) if date_match else None
        
        # 提取累计净值
        total_value_match = re.search(r'累计净值\([0-9-]+\)</dt>\s*</dl>\s*<dl>\s*<dd>\s*<strong[^>]*>([^<]+)</strong>', html)
        total_value = total_value_match.group(1) if total_value_match else None
        
        if net_value:
            return {
                "success": True,
                "data": {
                    "code": fund_code,
                    "net_value": net_value,
                    "date": date,
                    "total_value": total_value,
                    "source": "fsfund_official",
                    "timestamp": datetime.now().isoformat()
                }
            }
        else:
            return {
                "success": False,
                "error": "未找到净值数据"
            }
            
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }

if __name__ == "__main__":
    if len(sys.argv) > 1:
        fund_code = sys.argv[1]
        result = get_fsfund_data(fund_code)
        print(json.dumps(result))
    else:
        # 测试模式
        result = get_fsfund_data("162411")
        print(json.dumps(result))