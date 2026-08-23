import React from 'react';
import { useListAdminUsers } from '@workspace/api-client-react';
import { AdminSidebar } from '@/components/layout';
import { Card, CardContent, Input, Button, Badge, Skeleton } from '@/components/ui';
import { Search, Filter, MoreHorizontal } from 'lucide-react';
import { format } from 'date-fns';
import { arSA } from 'date-fns/locale';

export default function AdminUsers() {
  const { data: users, isLoading } = useListAdminUsers();

  return (
    <AdminSidebar>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-primary">المستخدمين</h1>
          <p className="text-muted-foreground mt-1">إدارة عملاء المنصة وصلاحياتهم</p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <div className="relative w-full md:w-64">
            <Search className="w-4 h-4 absolute right-3 top-3 text-muted-foreground" />
            <Input className="pr-9" placeholder="بحث بالاسم أو البريد..." />
          </div>
          <Button variant="outline" size="icon"><Filter className="w-4 h-4" /></Button>
        </div>
      </div>

      <Card className="border-border/50 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right">
            <thead className="bg-muted border-b border-border text-sm">
              <tr>
                <th className="py-4 px-6 font-bold text-foreground">الاسم</th>
                <th className="py-4 px-6 font-bold text-foreground">البريد الإلكتروني</th>
                <th className="py-4 px-6 font-bold text-foreground">تاريخ التسجيل</th>
                <th className="py-4 px-6 font-bold text-foreground">الدور</th>
                <th className="py-4 px-6 font-bold text-foreground text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {isLoading ? (
                [1,2,3,4,5].map(i => (
                  <tr key={i} className="border-b border-border">
                    <td className="py-4 px-6"><Skeleton className="h-4 w-32" /></td>
                    <td className="py-4 px-6"><Skeleton className="h-4 w-40" /></td>
                    <td className="py-4 px-6"><Skeleton className="h-4 w-24" /></td>
                    <td className="py-4 px-6"><Skeleton className="h-6 w-16 rounded-full" /></td>
                    <td className="py-4 px-6"><Skeleton className="h-8 w-8 mx-auto" /></td>
                  </tr>
                ))
              ) : users?.map((user) => (
                <tr key={user.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                  <td className="py-4 px-6 font-medium text-foreground">{user.name}</td>
                  <td className="py-4 px-6 text-muted-foreground font-mono text-sm">{user.email}</td>
                  <td className="py-4 px-6 text-muted-foreground">
                    {format(new Date(user.createdAt), 'dd/MM/yyyy', { locale: arSA })}
                  </td>
                  <td className="py-4 px-6">
                    <Badge variant={user.role === 'admin' ? 'secondary' : 'default'} className={user.role === 'admin' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'}>
                      {user.role === 'admin' ? 'مدير' : 'عميل'}
                    </Badge>
                  </td>
                  <td className="py-4 px-6 text-center">
                    <Button variant="ghost" size="icon" className="hover:bg-muted text-muted-foreground">
                      <MoreHorizontal className="w-4 h-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {users?.length === 0 && !isLoading && (
          <div className="p-8 text-center text-muted-foreground">لا يوجد مستخدمين لعرضهم</div>
        )}
      </Card>
    </AdminSidebar>
  );
}
