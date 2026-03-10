#!/usr/bin/env python3
"""
AkShare数据获取脚本 - 简化版
供Node.js服务器调用
"""

import akshare as ak
import json
import sys
from datetime import datetime

def get_fund_price(fund_code):
    """获取基金场内价格"""
    try:
        print(f"开始获取基金数据: {fund_code}", file=sys.stderr)
        
        # 确定交易所代码
        if fund_code.startswith(('15', '16')):
            exchange_code = f"sz{fund_code}"
        elif fund_code.startswith(('50', '51')):
            exchange_code = f"sh{fund_code}"
        else:
            exchange_code = f"sz{fund_code}"  # 默认深交所
        
        print(f"尝试获取ETF历史数据: {exchange_code}", file=sys.stderr)
        
        # 使用已验证可用的接口
        hist_data = ak.fund_etf_hist_sina(symbol=exchange_code)
        
        if not hist_data.empty:
            latest = hist_data.iloc[-1]
            price = latest.get('close', 0)
            date = latest.get('date', '')
            
            print(f"✅ 获取历史数据成功: {price}", file=sys.stderr)
            
            return {
                "success": True,
                "data": {
                    "code": fund_code,
                    "price": float(price),
                    "date": str(date),
                    "source": "akshare_sina_hist",
                    "timestamp": datetime.now().isoformat()
                }
            }
        else:
            print("❌ 历史数据为空", file=sys.stderr)
            return {
                "success": False,
                "error": "历史数据为空"
            }
            
    except Exception as e:
        error_msg = f"获取数据失败: {str(e)}"
        print(f"❌ {error_msg}", file=sys.stderr)
        return {
            "success": False,
            "error": error_msg
        }

if __name__ == "__main__":
    # 命令行参数：基金代码
    if len(sys.argv) > 1:
        fund_code = sys.argv[1]
        result = get_fund_price(fund_code)
        print(json.dumps(result))
    else:
        # 测试模式
        print("测试模式 - 获取162411数据", file=sys.stderr)
        result = get_fund_price("162411")
        print(json.dumps(result))